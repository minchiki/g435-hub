//! Иконка в трее: процент заряда цифрами и полоска уровня, меню, подсказка.

use crate::worker::State;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub const ID: &str = "main";
const SIZE: usize = 32;

/// Цифры 5×7, строка — 5 младших бит, старший слева.
const DIGITS: [[u8; 7]; 10] = [
    [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
    [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
    [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
    [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
    [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
    [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
    [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
    [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
];

/// Светлая панель задач Windows: тогда цифры тёмные.
fn light_taskbar() -> bool {
    use windows::Win32::System::Registry::*;
    use windows::core::w;
    let mut value = 0u32;
    let mut size = 4u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    status.is_ok() && value == 1
}

fn ink() -> ([u8; 4], [u8; 4]) {
    if light_taskbar() { ([24, 24, 28, 255], [176, 181, 189, 255]) } else { ([255, 255, 255, 255], [90, 96, 106, 255]) }
}

fn level_color(percent: u8) -> [u8; 4] {
    match percent {
        0..=15 => [255, 90, 95, 255],
        16..=30 => [245, 165, 36, 255],
        _ => [68, 209, 122, 255],
    }
}

struct Canvas(Vec<u8>);

impl Canvas {
    fn new() -> Self {
        Canvas(vec![0; SIZE * SIZE * 4])
    }
    fn fill(&mut self, x0: usize, y0: usize, w: usize, h: usize, c: [u8; 4]) {
        for y in y0..(y0 + h).min(SIZE) {
            for x in x0..(x0 + w).min(SIZE) {
                let i = (y * SIZE + x) * 4;
                self.0[i..i + 4].copy_from_slice(&c);
            }
        }
    }
    /// Цифра 5×7 в масштабе 2 с утолщением по горизонтали: 12×14 px.
    fn digit(&mut self, d: usize, x0: usize, y0: usize, c: [u8; 4]) {
        for (row, bits) in DIGITS[d].iter().enumerate() {
            for col in 0..5 {
                if bits & (1 << (4 - col)) != 0 {
                    self.fill(x0 + col * 2, y0 + row * 2, 3, 2, c);
                }
            }
        }
    }
}

/// Иконка: две цифры процента сверху, полоска уровня снизу.
/// Три цифры в 16 px не читаются, поэтому 100% — значок полной батареи.
pub fn render(state: &State) -> Image<'static> {
    let mut c = Canvas::new();
    let (text, track) = ink();
    match &state.battery {
        Some(b) if state.dongle => {
            let color = level_color(b.percent);
            if b.percent < 100 {
                let tens = (b.percent / 10) as usize;
                let ones = (b.percent % 10) as usize;
                if tens > 0 {
                    c.digit(tens, 3, 1, text);
                    c.digit(ones, 17, 1, text);
                } else {
                    c.digit(ones, 10, 1, text);
                }
            } else {
                // полная батарея: корпус с контактом
                c.fill(3, 3, 24, 12, color);
                c.fill(27, 6, 3, 6, color);
            }
            c.fill(1, 21, 30, 9, track);
            let w = ((b.percent as usize * 28) / 100).max(2);
            c.fill(2, 22, w, 7, color);
        }
        _ => {
            // нет данных: прочерк и пустая полоска
            c.fill(8, 7, 16, 4, text);
            c.fill(1, 21, 30, 9, track);
        }
    }
    Image::new_owned(c.0, SIZE as u32, SIZE as u32)
}

pub use crate::i18n::tooltip;

/// Ключ того, что видно в трее: перерисовываем только при его изменении.
pub fn key(state: &State) -> (bool, Option<u8>, bool) {
    (
        state.dongle,
        state.battery.as_ref().filter(|_| state.dongle).map(|b| b.percent),
        state.error.as_deref() == Some("headset_off"),
    )
}

/// Пункты меню: хранятся, чтобы переименовать их при смене языка.
pub struct Items {
    open: MenuItem<tauri::Wry>,
    refresh: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

impl Items {
    pub fn set_lang(&self, lang: crate::i18n::Lang) {
        let (open, refresh, quit) = crate::i18n::menu(lang);
        let _ = self.open.set_text(open);
        let _ = self.refresh.set_text(refresh);
        let _ = self.quit.set_text(quit);
    }
}

pub fn setup(app: &AppHandle, lang: crate::i18n::Lang) -> tauri::Result<()> {
    let (t_open, t_refresh, t_quit) = crate::i18n::menu(lang);
    let open = MenuItem::with_id(app, "open", t_open, true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", t_refresh, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t_quit, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &refresh, &sep, &quit])?;
    app.manage(Items { open, refresh, quit });
    TrayIconBuilder::with_id(ID)
        .icon(render(&State::default()))
        .tooltip("G435 Hub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_window(app),
            "refresh" => app.state::<crate::Hub>().send(crate::worker::Cmd::RefreshBattery),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::show_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worker::Battery;

    /// G435_TRAY_DUMP=<папка> cargo test — сохраняет иконки как сырые RGBA 32×32.
    #[test]
    fn renders_icons() {
        let dir = std::env::var_os("G435_TRAY_DUMP");
        for pct in [7u8, 25, 45, 100] {
            let s = State {
                dongle: true,
                battery: Some(Battery {
                    millivolts: 3750,
                    percent: pct,
                    at_ms: 0,
                    charging: false,
                    hours_left: Some(8.0),
                    hours_source: None,
                }),
                ..Default::default()
            };
            let img = render(&s);
            assert_eq!(img.rgba().len(), SIZE * SIZE * 4);
            if let Some(d) = &dir {
                std::fs::write(std::path::Path::new(d).join(format!("tray_{pct}.rgba")), img.rgba()).unwrap();
            }
        }
        assert_eq!(tooltip(&State::default()), "G435 Hub — dongle not connected");
    }
}
