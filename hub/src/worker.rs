//! Фоновый поток: HID-донгл и Core Audio. UI шлёт команды, поток обновляет `State`
//! и вызывает `on_state` при каждом изменении, `on_alert` — при низком заряде.

use crate::audio::{self, Endpoint, Kind, Level};
use crate::battery::{self, Estimate, HoursSource, Sample};
use crate::hid;
use crate::i18n::{Lang, Language};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub enum Cmd {
    RefreshBattery,
    SetPoll(Option<Duration>),
    SetVolume(Kind, f32),
    SetMute(Kind, bool),
    SetAlert(u8),
    SetLanguage(Language),
    SetAutoUpdate(bool),
    ClearHistory,
}

/// Настройки, которые нужны и без окна (автозапуск в трей): хранятся в settings.json.
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    /// интервал автоопроса, мин; None — только вручную
    pub poll_minutes: Option<u64>,
    /// порог уведомления о низком заряде, %
    pub alert_percent: u8,
    /// язык интерфейса; Auto — язык Windows
    pub language: Language,
    /// проверять обновления при открытии окна (единственный сетевой запрос приложения)
    pub auto_update: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { poll_minutes: Some(15), alert_percent: 15, language: Language::Auto, auto_update: true }
    }
}

#[derive(Clone, Serialize, PartialEq)]
pub struct Battery {
    pub millivolts: u16,
    pub percent: u8,
    pub at_ms: u64,
    pub charging: bool,
    pub hours_left: Option<f32>,
    pub hours_source: Option<HoursSource>,
}

#[derive(Clone, Default, Serialize, PartialEq)]
pub struct State {
    pub dongle: bool,
    pub battery: Option<Battery>,
    /// код ошибки чтения (`hid::Error::code`): headset_off, dongle_missing, no_reply, hid_error:<текст>
    pub error: Option<String>,
    /// язык, который реально показывается
    pub lang: Lang,
    pub reading: bool,
    /// плановое чтение отложено: в наушниках играет звук
    pub deferred: bool,
    pub headphones: Option<Level>,
    pub microphone: Option<Level>,
    /// замеры за последние сутки: (мс с эпохи, мВ)
    pub history: Vec<(u64, u16)>,
    pub settings: Settings,
}

const NEVER: Duration = Duration::from_secs(10 * 365 * 24 * 3600);
const HISTORY_KEEP_MS: u64 = 7 * 24 * 3600 * 1000;
const HISTORY_UI_MS: u64 = 24 * 3600 * 1000;
const MAX_DEFER: Duration = Duration::from_secs(30 * 60);
/// Минимальный интервал между автоматическими чтениями (донгл при переподключении
/// может «мигать» несколько раз подряд).
const MIN_AUTO_GAP: Duration = Duration::from_secs(60);
/// Без звука дольше этого гарнитура считается простаивающей...
const IDLE_AFTER: Duration = Duration::from_secs(20 * 60);
/// ...и опрашивается не чаще раза в час: каждое обращение, вероятно, сбрасывает её
/// 30-минутный таймер автовыключения (в ночь на 2026-11-02 гарнитура при опросе
/// раз в 5 мин не выключилась и разрядилась до нуля).
const IDLE_POLL: Duration = Duration::from_secs(60 * 60);
/// Второй, «последний» порог предупреждения.
const ALERT_CRITICAL: u8 = 5;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// Файлы в папке данных: battery-history.json — JSON-массив [[мс, мВ], ...] за 7 дней,
/// settings.json — `Settings`.
struct Store(Option<PathBuf>);

fn write_atomic(path: &std::path::Path, text: &str) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

impl Store {
    fn file(&self, name: &str) -> Option<PathBuf> {
        self.0.as_ref().map(|d| d.join(name))
    }

    fn load_settings(&self) -> Settings {
        self.file("settings.json")
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    }

    fn save_settings(&self, s: &Settings) {
        if let (Some(p), Ok(text)) = (self.file("settings.json"), serde_json::to_string(s)) {
            write_atomic(&p, &text);
        }
    }

    fn load(&self) -> Vec<Sample> {
        let Some(path) = &self.file("battery-history.json") else { return Vec::new() };
        let Ok(text) = std::fs::read_to_string(path) else { return Vec::new() };
        let pairs: Vec<(u64, u16)> = serde_json::from_str(&text).unwrap_or_default();
        let cutoff = now_ms().saturating_sub(HISTORY_KEEP_MS);
        pairs.into_iter().filter(|p| p.0 >= cutoff).map(|(at_ms, mv)| Sample { at_ms, mv }).collect()
    }

    fn save(&self, h: &[Sample]) {
        let Some(path) = &self.file("battery-history.json") else { return };
        let pairs: Vec<(u64, u16)> = h.iter().map(|s| (s.at_ms, s.mv)).collect();
        if let Ok(text) = serde_json::to_string(&pairs) {
            write_atomic(path, &text);
        }
    }
}

pub fn spawn(
    data_dir: Option<PathBuf>,
    on_state: impl Fn(&State) + Send + 'static,
    on_alert: impl Fn(u8) + Send + 'static,
) -> (Sender<Cmd>, Arc<Mutex<State>>) {
    let (tx, rx) = channel();
    let state = Arc::new(Mutex::new(State::default()));
    let shared = state.clone();
    std::thread::Builder::new()
        .name("g435-worker".into())
        .spawn(move || run(rx, shared, Store(data_dir), on_state, on_alert))
        .expect("worker thread");
    (tx, state)
}

fn ui_history(h: &[Sample]) -> Vec<(u64, u16)> {
    let cutoff = now_ms().saturating_sub(HISTORY_UI_MS);
    h.iter().filter(|s| s.at_ms >= cutoff).map(|s| (s.at_ms, s.mv)).collect()
}

fn run(rx: Receiver<Cmd>, state: Arc<Mutex<State>>, store: Store, on_state: impl Fn(&State), on_alert: impl Fn(u8)) {
    audio::init_com();
    let mut endpoints: [Option<Endpoint>; 2] = [None, None];
    let mut last_find = Instant::now() - Duration::from_secs(60);
    let mut last_dongle_check = Instant::now() - Duration::from_secs(60);
    let mut settings = store.load_settings();
    let mut poll: Option<Duration> = settings.poll_minutes.map(|m| Duration::from_secs(m * 60));
    let mut next_battery = Instant::now() + NEVER;
    let mut manual = false;
    let mut deferred_since: Option<Instant> = None;
    let mut dongle = false;
    let mut history = store.load();
    let mut estimate: Option<Estimate>;
    // уровни, о которых уже предупредили в текущей разрядке
    let mut alerted: Vec<u8> = Vec::new();
    let mut last_read: Option<Instant> = None;
    let mut last_audio = Instant::now();

    let update = |f: &dyn Fn(&mut State)| {
        let mut s = state.lock().unwrap();
        let before = s.clone();
        f(&mut s);
        if *s != before {
            on_state(&s);
        }
    };
    {
        // свежий замер с прошлого запуска (≤ 2 ч) показываем сразу, с его настоящим временем
        estimate = history
            .last()
            .filter(|s| now_ms() - s.at_ms < 2 * 3600 * 1000)
            .and_then(|_| battery::estimate(&history, None));
        // без свежего замера — прочитать сразу после старта
        if estimate.is_none() {
            next_battery = Instant::now() + Duration::from_secs(2);
        } else if let Some(p) = poll {
            next_battery = Instant::now() + p;
        }
        let last = history.last().copied();
        let h = ui_history(&history);
        let st = settings.clone();
        update(&|s| {
            s.history = h.clone();
            s.lang = st.language.resolve();
            s.settings = st.clone();
            if let (Some(e), Some(l)) = (&estimate, last) {
                s.battery = Some(Battery {
                    millivolts: l.mv,
                    percent: e.percent,
                    at_ms: l.at_ms,
                    charging: e.charging,
                    hours_left: e.hours_left,
                    hours_source: e.hours_source,
                });
            }
        });
    }

    loop {
        match rx.recv_timeout(Duration::from_millis(400)) {
            Ok(Cmd::RefreshBattery) => {
                next_battery = Instant::now();
                manual = true;
            }
            Ok(Cmd::SetPoll(p)) => {
                poll = p;
                next_battery = Instant::now() + p.unwrap_or(NEVER);
                settings.poll_minutes = p.map(|d| d.as_secs() / 60);
                store.save_settings(&settings);
                let st = settings.clone();
                update(&|s| s.settings = st.clone());
            }
            Ok(Cmd::SetAlert(pct)) => {
                settings.alert_percent = pct.clamp(5, 50);
                store.save_settings(&settings);
                alerted.clear();
                let st = settings.clone();
                update(&|s| s.settings = st.clone());
            }
            Ok(Cmd::SetLanguage(language)) => {
                settings.language = language;
                store.save_settings(&settings);
                let st = settings.clone();
                update(&|s| {
                    s.lang = st.language.resolve();
                    s.settings = st.clone();
                });
            }
            Ok(Cmd::SetAutoUpdate(on)) => {
                settings.auto_update = on;
                store.save_settings(&settings);
                let st = settings.clone();
                update(&|s| s.settings = st.clone());
            }
            Ok(Cmd::ClearHistory) => {
                // оставляем последний замер: на нём держится текущая оценка
                let keep = history.last().copied();
                history = keep.into_iter().collect();
                store.save(&history);
                estimate = battery::estimate(&history, None);
                let h = ui_history(&history);
                update(&|s| s.history = h.clone());
            }
            Ok(Cmd::SetVolume(kind, v)) => {
                if let Some(e) = &endpoints[kind as usize] {
                    e.set_volume(v)
                }
            }
            Ok(Cmd::SetMute(kind, m)) => {
                if let Some(e) = &endpoints[kind as usize] {
                    e.set_mute(m)
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }

        // аудиоустройства: переискиваем пропавшие не чаще раза в 5 с
        if endpoints.iter().any(Option::is_none) && last_find.elapsed() > Duration::from_secs(5) {
            last_find = Instant::now();
            endpoints = [audio::find(Kind::Headphones), audio::find(Kind::Microphone)];
        }
        let levels = endpoints.each_ref().map(|e| e.as_ref().and_then(Endpoint::level));
        for (slot, level) in endpoints.iter_mut().zip(levels) {
            if level.is_none() {
                *slot = None;
            }
        }
        if last_dongle_check.elapsed() > Duration::from_secs(2) {
            last_dongle_check = Instant::now();
            let was = dongle;
            dongle = hid::dongle_present();
            // донгл только что вставили — прочитать заряд сразу
            if dongle && !was && estimate.is_some() {
                next_battery = Instant::now() + Duration::from_secs(3);
            }
        }
        update(&|s| {
            s.headphones = levels[0];
            s.microphone = levels[1];
            s.dongle = dongle;
        });
        if endpoints[0].as_ref().is_some_and(|e| e.peak() > 0.001) {
            last_audio = Instant::now();
        }

        if !dongle || Instant::now() < next_battery {
            continue;
        }
        if !manual {
            let idle = last_audio.elapsed() > IDLE_AFTER;
            let gap = if idle { IDLE_POLL.max(poll.unwrap_or(IDLE_POLL)) } else { MIN_AUTO_GAP };
            if let Some(t) = last_read.filter(|t| t.elapsed() < gap) {
                next_battery = t + gap;
                continue;
            }
        }

        // Чтение заряда прерывает звук ~на секунду: плановое чтение ждёт тишины
        // (не дольше 30 мин), ручное выполняется сразу.
        let playing = endpoints[0].as_ref().is_some_and(|e| {
            (0..4).any(|_| {
                std::thread::sleep(Duration::from_millis(50));
                e.peak() > 0.001
            })
        });
        if !manual && playing && deferred_since.is_none_or(|t| t.elapsed() < MAX_DEFER) {
            deferred_since.get_or_insert_with(Instant::now);
            next_battery = Instant::now() + Duration::from_secs(60);
            update(&|s| s.deferred = true);
            continue;
        }
        deferred_since = None;
        manual = false;

        update(&|s| {
            s.reading = true;
            s.deferred = false;
        });
        let result = hid::read_battery();
        last_read = Some(Instant::now());
        if let Ok(mv) = &result {
            history.push(Sample { at_ms: now_ms(), mv: *mv });
            let cutoff = now_ms().saturating_sub(HISTORY_KEEP_MS);
            history.retain(|s| s.at_ms >= cutoff);
            store.save(&history);
            estimate = battery::estimate(&history, estimate.as_ref());
            if let Some(e) = &estimate {
                if e.charging || e.percent > settings.alert_percent + 5 {
                    alerted.clear();
                } else if let Some(level) = [settings.alert_percent, ALERT_CRITICAL]
                    .into_iter()
                    .filter(|&l| e.percent <= l && !alerted.contains(&l))
                    .min()
                {
                    // отмечаем этот и все более высокие уровни, чтобы не слать два подряд
                    alerted.extend([settings.alert_percent, ALERT_CRITICAL].into_iter().filter(|&l| l >= level));
                    on_alert(e.percent);
                }
            }
        }
        let at = now_ms();
        let ui_hist = ui_history(&history);
        update(&|s| {
            s.reading = false;
            match &result {
                Ok(mv) => {
                    if let Some(e) = &estimate {
                        s.battery = Some(Battery {
                            millivolts: *mv,
                            percent: e.percent,
                            at_ms: at,
                            charging: e.charging,
                            hours_left: e.hours_left,
                            hours_source: e.hours_source,
                        });
                    }
                    s.error = None;
                    s.history = ui_hist.clone();
                }
                Err(e) => s.error = Some(e.code()),
            }
        });
        // после ошибки — повтор через минуту; при низком заряде и на зарядке — чаще
        let fast = estimate.as_ref().is_some_and(|e| e.charging || e.percent <= 20);
        next_battery = Instant::now()
            + match (&result, poll) {
                (Err(_), Some(_)) => Duration::from_secs(60),
                (_, Some(d)) if fast => d.min(Duration::from_secs(5 * 60)),
                (_, Some(d)) => d,
                (_, None) => NEVER,
            };
    }
}
