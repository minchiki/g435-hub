//! Interface language: the user's choice (or the Windows display language) and the few strings
//! the native side shows itself: tray tooltip and menu, low-battery notification.
//! Everything inside the window is translated in ui/i18n.js.

use crate::worker::State;
use serde::{Deserialize, Serialize};
use windows::Win32::Globalization::GetUserDefaultLocaleName;

/// What the user picked in Settings.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    Auto,
    En,
    Ru,
}

/// What is actually shown.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    En,
    Ru,
}

impl Language {
    pub fn resolve(self) -> Lang {
        match self {
            Language::En => Lang::En,
            Language::Ru => Lang::Ru,
            Language::Auto => system_lang(),
        }
    }
}

fn system_lang() -> Lang {
    let mut buf = [0u16; 85];
    let n = unsafe { GetUserDefaultLocaleName(&mut buf) };
    let name = String::from_utf16_lossy(&buf[..(n.max(1) as usize - 1).min(buf.len())]);
    if name.to_ascii_lowercase().starts_with("ru") { Lang::Ru } else { Lang::En }
}

pub fn hours_text(lang: Lang, h: f32) -> String {
    let (n, short) = if h < 1.0 { ((h * 60.0).round().max(5.0) as u32, true) } else { (h.round() as u32, false) };
    match (lang, short) {
        (Lang::En, true) => format!("{n} min"),
        (Lang::En, false) => format!("{n} h"),
        (Lang::Ru, true) => format!("{n} мин"),
        (Lang::Ru, false) => format!("{n} ч"),
    }
}

pub fn tooltip(state: &State) -> String {
    let l = state.lang;
    let pick = |en: &str, ru: &str| if l == Lang::Ru { ru.to_string() } else { en.to_string() };
    if !state.dongle {
        return pick("G435 Hub — dongle not connected", "G435 Hub — донгл не подключён");
    }
    match (&state.battery, state.error.as_deref()) {
        (_, Some("headset_off")) => pick("G435 Hub — headset is off", "G435 Hub — гарнитура выключена"),
        (Some(b), _) => {
            let extra = if b.charging {
                pick(", probably charging", ", вероятно заряжается")
            } else {
                b.hours_left
                    .map(|h| format!("{} {}", pick(", about", ", осталось ≈"), hours_text(l, h)))
                    .map(|t| if l == Lang::En { format!("{t} left") } else { t })
                    .unwrap_or_default()
            };
            format!("G435 — {}%{extra} ({} {})", b.percent, b.millivolts, pick("mV", "мВ"))
        }
        (None, _) => pick("G435 Hub — battery not read yet", "G435 Hub — заряд ещё не прочитан"),
    }
}

/// (open, refresh, quit)
pub fn menu(lang: Lang) -> (&'static str, &'static str, &'static str) {
    match lang {
        Lang::En => ("Open G435 Hub", "Refresh battery", "Quit"),
        Lang::Ru => ("Открыть G435 Hub", "Обновить заряд", "Выход"),
    }
}

/// (title, body)
pub fn low_battery(lang: Lang, percent: u8) -> (String, &'static str) {
    match lang {
        Lang::En => (format!("G435: battery {percent}%"), "Put the headset on charge."),
        Lang::Ru => (format!("G435: заряд {percent}%"), "Поставьте гарнитуру на зарядку."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_choice_wins() {
        assert_eq!(Language::Ru.resolve(), Lang::Ru);
        assert_eq!(Language::En.resolve(), Lang::En);
    }

    #[test]
    fn hours() {
        assert_eq!(hours_text(Lang::En, 0.2), "12 min");
        assert_eq!(hours_text(Lang::En, 0.01), "5 min");
        assert_eq!(hours_text(Lang::Ru, 8.4), "8 ч");
    }

    #[test]
    fn tooltips() {
        assert_eq!(tooltip(&State::default()), "G435 Hub — dongle not connected");
        let ru = State { lang: Lang::Ru, ..Default::default() };
        assert_eq!(tooltip(&ru), "G435 Hub — донгл не подключён");
    }
}
