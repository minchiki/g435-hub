//! Оценка заряда по истории напряжений: сглаживание, признак зарядки, остаток времени.
//!
//! Гарнитура сообщает только напряжение. Отсюда правила:
//! - внутри одного сеанса замеры шумят на ±5 мВ, между сеансами — на ~20 мВ из-за
//!   нагрузки; поэтому процент считается по медиане последних замеров, а при разрядке
//!   показанный процент не растёт;
//! - рост напряжения на 30 мВ и больше между соседними замерами — признак зарядки
//!   (команда «идёт зарядка» для 0ACB неизвестна, это вывод, а не факт);
//! - остаток времени — по наклону разрядки (МНК), иначе по паспорту «до 18 ч».

use crate::hid::millivolts_to_percent;
use serde::Serialize;

pub const SPEC_HOURS: f32 = 18.0;
const CHARGE_RISE_MV: i32 = 30;
const SMOOTH_WINDOW_MS: u64 = 45 * 60 * 1000;
const GAP_RESET_MS: u64 = 2 * 3600 * 1000;
const TREND_MIN_SPAN_MS: u64 = 40 * 60 * 1000;
const FALLING_MV: i32 = 15;
const CHARGE_WINDOW_MS: u64 = 30 * 60 * 1000;
const CHARGE_RISE_WINDOW_MV: i32 = 45;
/// Скорость разрядки растёт к концу (по ночным данным 2026-11-02 — в 4 раза), поэтому
/// сначала смотрим на последние 2 ч, и только если там пусто — на весь отрезок.
const TREND_RECENT_MS: u64 = 2 * 3600 * 1000;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Sample {
    pub at_ms: u64,
    pub mv: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HoursSource {
    Trend,
    Spec,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Estimate {
    /// показываемый процент: сглаженный и не растущий при разрядке
    pub percent: u8,
    pub charging: bool,
    pub hours_left: Option<f32>,
    pub hours_source: Option<HoursSource>,
}

/// Напряжение в замере `i` выше самого низкого за последние 30 мин на 45 мВ и больше.
/// Заряд даёт мелкие шаги (+3…+27 мВ), которые по одному не заметны, а накопленный рост —
/// заметен; шум разрядки не превышает ±9 мВ.
fn rising_at(h: &[Sample], i: usize) -> bool {
    h[..i]
        .iter()
        .rev()
        .take_while(|s| h[i].at_ms - s.at_ms <= CHARGE_WINDOW_MS)
        .map(|s| s.mv)
        .min()
        .is_some_and(|low| h[i].mv as i32 - low as i32 >= CHARGE_RISE_WINDOW_MV)
}

/// Индекс начала текущего отрезка разрядки: после последнего роста напряжения
/// или большого перерыва между замерами.
fn discharge_start(h: &[Sample]) -> usize {
    (1..h.len())
        .rev()
        .find(|&i| {
            h[i].mv as i32 - h[i - 1].mv as i32 >= CHARGE_RISE_MV
                || h[i].at_ms - h[i - 1].at_ms > GAP_RESET_MS
                || rising_at(h, i)
        })
        .unwrap_or(0)
}

fn median_mv(samples: &[Sample]) -> u16 {
    let mut v: Vec<u16> = samples.iter().map(|s| s.mv).collect();
    v.sort_unstable();
    v[v.len() / 2]
}

/// `prev` — предыдущая оценка (для монотонности и «залипания» признака зарядки).
pub fn estimate(history: &[Sample], prev: Option<&Estimate>) -> Option<Estimate> {
    let last = *history.last()?;
    let before = history.len().checked_sub(2).map(|i| history[i]);
    let delta = before.map(|b| last.mv as i32 - b.mv as i32);
    let fresh_gap = before.is_none_or(|b| last.at_ms - b.at_ms > GAP_RESET_MS);

    let charging = match (delta, prev) {
        (Some(d), _) if d >= CHARGE_RISE_MV => true,
        (Some(_), _) if !fresh_gap && rising_at(history, history.len() - 1) => true,
        // зарядка продолжается, пока напряжение заметно не пошло вниз
        (Some(d), Some(p)) if p.charging && !fresh_gap => d > -15,
        _ => false,
    };

    let start = discharge_start(history);
    let segment = &history[start..];
    let window: Vec<Sample> =
        segment.iter().rev().take_while(|s| last.at_ms - s.at_ms <= SMOOTH_WINDOW_MS).take(3).copied().collect();
    // Медиана гасит шум, но при быстром падении (конец разрядки) тянет процент вверх:
    // если последний замер ниже медианы больше, чем шум (±9 мВ), верим ему.
    let median = median_mv(&window);
    let mv = if (last.mv as i32) <= median as i32 - FALLING_MV { last.mv } else { median };
    let smoothed = millivolts_to_percent(mv);
    let percent = match prev {
        Some(p) if !charging && !p.charging && !fresh_gap => smoothed.min(p.percent),
        _ => smoothed,
    };

    let (hours_left, hours_source) = if charging {
        (None, None)
    } else if let Some(rate) = discharge_rate(segment) {
        (Some((percent as f32 / rate).min(40.0)), Some(HoursSource::Trend))
    } else {
        (Some(percent as f32 / 100.0 * SPEC_HOURS), Some(HoursSource::Spec))
    };
    Some(Estimate { percent, charging, hours_left, hours_source })
}

/// Скорость разрядки, %/ч: последние 2 ч отрезка, иначе весь отрезок.
fn discharge_rate(segment: &[Sample]) -> Option<f32> {
    let last = segment.last()?.at_ms;
    let recent = segment.partition_point(|s| last - s.at_ms > TREND_RECENT_MS);
    fit_rate(&segment[recent..]).or_else(|| fit_rate(segment))
}

/// МНК на отрезке ≥ 40 мин из ≥ 3 замеров.
fn fit_rate(segment: &[Sample]) -> Option<f32> {
    if segment.len() < 3 || segment.last()?.at_ms - segment[0].at_ms < TREND_MIN_SPAN_MS {
        return None;
    }
    let t0 = segment[0].at_ms;
    let pts: Vec<(f32, f32)> =
        segment.iter().map(|s| ((s.at_ms - t0) as f32 / 3.6e6, millivolts_to_percent(s.mv) as f32)).collect();
    let n = pts.len() as f32;
    let (sx, sy) = pts.iter().fold((0.0, 0.0), |(a, b), (x, y)| (a + x, b + y));
    let (mx, my) = (sx / n, sy / n);
    let (num, den) = pts.iter().fold((0.0, 0.0), |(a, b), (x, y)| (a + (x - mx) * (y - my), b + (x - mx).powi(2)));
    let slope = num / den;
    // слишком пологий или растущий тренд — шум, не оценка
    (slope < -0.5).then_some(-slope)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: u64 = 60_000;

    fn s(min: u64, mv: u16) -> Sample {
        Sample { at_ms: min * MIN, mv }
    }

    fn run(h: &[Sample]) -> Estimate {
        let mut prev: Option<Estimate> = None;
        for i in 1..=h.len() {
            prev = estimate(&h[..i], prev.as_ref());
        }
        prev.unwrap()
    }

    #[test]
    fn single_sample_uses_spec_hours() {
        let e = run(&[s(0, 3768)]);
        assert_eq!(e.percent, 46);
        assert!(!e.charging);
        assert_eq!(e.hours_source, Some(HoursSource::Spec));
    }

    #[test]
    fn noise_does_not_raise_percent_while_discharging() {
        // реальный разброс: 3768 -> 3789 мВ при разной нагрузке
        let e = run(&[s(0, 3768), s(15, 3789)]);
        assert_eq!(e.percent, 46);
        assert!(!e.charging);
    }

    #[test]
    fn rise_means_charging() {
        let e = run(&[s(0, 3700), s(15, 3760)]);
        assert!(e.charging);
        assert_eq!(e.hours_left, None);
        assert!(e.percent > millivolts_to_percent(3700));
        // продолжает заряжаться при плато
        let e = run(&[s(0, 3700), s(15, 3760), s(30, 3758)]);
        assert!(e.charging);
        // напряжение пошло вниз — разрядка
        let e = run(&[s(0, 3700), s(15, 3760), s(30, 3730)]);
        assert!(!e.charging);
    }

    #[test]
    fn trend_gives_hours_left() {
        // ~5,5 %/ч: от 3850 (62%) до 3800 (55%) за ~75 мин
        let e = run(&[s(0, 3850), s(15, 3840), s(30, 3830), s(45, 3820), s(60, 3810), s(75, 3800)]);
        assert_eq!(e.hours_source, Some(HoursSource::Trend));
        let h = e.hours_left.unwrap();
        assert!((8.0..12.0).contains(&h), "{h}");
    }

    // Реальная разрядка G435, ночь на 2026-11-02: минуты от 23:42, мВ (шаг ~30 мин).
    const NIGHT: [(u64, u16); 12] = [
        (0, 3750),
        (34, 3735),
        (85, 3720),
        (140, 3705),
        (201, 3702),
        (261, 3699),
        (292, 3690),
        (322, 3672),
        (352, 3624),
        (382, 3555),
        (413, 3450),
        (438, 3318),
    ];
    // Реальная зарядка там же, днём: минуты от первого замера, мВ.
    const CHARGE: [(u64, u16); 7] = [(0, 3810), (5, 3912), (9, 3939), (10, 3945), (14, 3978), (21, 3999), (22, 4005)];

    fn series(pts: &[(u64, u16)]) -> Vec<Sample> {
        pts.iter().map(|&(m, mv)| s(m, mv)).collect()
    }

    #[test]
    fn real_night_percent_never_rises_and_hits_zero() {
        let h = series(&NIGHT);
        let mut prev: Option<Estimate> = None;
        let mut last_percent = 100;
        for i in 1..=h.len() {
            let e = estimate(&h[..i], prev.as_ref()).unwrap();
            assert!(e.percent <= last_percent, "шаг {i}: {} > {last_percent}", e.percent);
            assert!(!e.charging, "шаг {i} принят за зарядку");
            last_percent = e.percent;
            prev = Some(e);
        }
        assert_eq!(last_percent, 0);
        // в 04:34 (замер 7 из 12) гарнитура проработала ещё ~2,5 ч: оценка в разумных пределах
        let e = run(&h[..7]);
        assert_eq!(e.hours_source, Some(HoursSource::Trend));
        let hours = e.hours_left.unwrap();
        assert!((1.5..8.0).contains(&hours), "{hours}");
    }

    #[test]
    fn real_charge_detected_from_second_sample() {
        let h = series(&CHARGE);
        let mut prev = None;
        for i in 1..=h.len() {
            let e = estimate(&h[..i], prev.as_ref()).unwrap();
            // первый замер после долгого перерыва ничего не говорит о зарядке
            assert_eq!(e.charging, i > 1, "шаг {i}");
            prev = Some(e);
        }
        assert_eq!(prev.unwrap().hours_left, None);
    }

    #[test]
    fn slow_charge_steps_are_detected_by_cumulative_rise() {
        // +25 мВ каждые 10 мин: ни один шаг не достигает 30 мВ
        let e = run(&[s(0, 3700), s(10, 3725), s(20, 3750)]);
        assert!(e.charging);
        // шум разрядки (±9 мВ) зарядкой не считается
        let e = run(&[s(0, 3705), s(10, 3696), s(20, 3705), s(30, 3702)]);
        assert!(!e.charging);
    }

    #[test]
    fn recent_window_beats_whole_segment_when_drain_accelerates() {
        // 4 ч медленной разрядки, затем быстрая: оценка идёт по быстрой
        let mut pts: Vec<(u64, u16)> = (0..8).map(|i| (i * 30, 3800 - (i as u16) * 4)).collect();
        pts.extend([(240, 3690), (270, 3660), (300, 3620), (330, 3570)]);
        let e = run(&series(&pts));
        let slow = e.percent as f32 / 2.0; // если бы считали по среднему за весь отрезок: ~2 %/ч
        assert!(e.hours_left.unwrap() < slow, "{:?} vs {slow}", e.hours_left);
    }

    #[test]
    fn long_gap_resets_monotonic_limit() {
        // ночью гарнитуру зарядили при выключенном хабе
        let e = run(&[s(0, 3700), s(600, 4150)]);
        assert_eq!(e.percent, 95);
    }
}
