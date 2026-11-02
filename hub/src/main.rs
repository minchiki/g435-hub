#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! G435 Hub — лёгкая замена Logitech G Hub для гарнитуры G435 (донгл 046D:0ACB).
//! Rust: HID, Core Audio и трей; интерфейс — ui/ в WebView2 (three.js).
//! Окно при закрытии уничтожается целиком (вместе с WebView2), в фоне остаётся трей.

mod audio;
mod autostart;
mod battery;
mod diag;
mod hid;
mod i18n;
mod tray;
mod worker;

use audio::Kind;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
use worker::Cmd;

pub struct Hub {
    tx: Mutex<Sender<Cmd>>,
    state: Arc<Mutex<worker::State>>,
}

impl Hub {
    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.lock().unwrap().send(cmd);
    }
}

/// Показывает окно, создавая его заново, если оно было закрыто.
pub fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    if let Some(cfg) = app.config().app.windows.first()
        && let Ok(w) = WebviewWindowBuilder::from_config(app, cfg).and_then(|b| b.build())
    {
        let _ = w.set_focus();
    }
}

fn kind(name: &str) -> Result<Kind, String> {
    match name {
        "headphones" => Ok(Kind::Headphones),
        "microphone" => Ok(Kind::Microphone),
        _ => Err(format!("unknown device: {name}")),
    }
}

#[tauri::command]
fn get_state(hub: State<Hub>) -> worker::State {
    hub.state.lock().unwrap().clone()
}

#[tauri::command]
fn refresh_battery(hub: State<Hub>) {
    hub.send(Cmd::RefreshBattery);
}

#[tauri::command]
fn set_poll(hub: State<Hub>, minutes: Option<u64>) {
    hub.send(Cmd::SetPoll(minutes.filter(|&m| m > 0).map(|m| Duration::from_secs(m * 60))));
}

#[tauri::command]
fn set_volume(hub: State<Hub>, kind: &str, value: f32) -> Result<(), String> {
    hub.send(Cmd::SetVolume(self::kind(kind)?, value));
    Ok(())
}

#[tauri::command]
fn set_mute(hub: State<Hub>, kind: &str, muted: bool) -> Result<(), String> {
    hub.send(Cmd::SetMute(self::kind(kind)?, muted));
    Ok(())
}

#[tauri::command]
fn set_alert(hub: State<Hub>, percent: u8) {
    hub.send(Cmd::SetAlert(percent));
}

#[tauri::command]
fn set_language(hub: State<Hub>, language: i18n::Language) {
    hub.send(Cmd::SetLanguage(language));
}

#[tauri::command]
fn set_auto_update(hub: State<Hub>, enabled: bool) {
    hub.send(Cmd::SetAutoUpdate(enabled));
}

/// Text for a bug report (see diag.rs): no personal data.
#[tauri::command]
fn get_diagnostics(app: AppHandle, hub: State<Hub>) -> String {
    let s = hub.state.lock().unwrap().clone();
    diag::report(&app.package_info().version.to_string(), tauri::webview_version().ok(), &s)
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    diag::copy_to_clipboard(&text)
}

/// Opens a link in the default browser. Only the project's own pages and the credited sources are allowed.
#[tauri::command]
fn open_url(url: &str) -> Result<(), String> {
    const ALLOWED: [&str; 3] = [
        "https://github.com/minchiki/g435-hub",
        "https://github.com/deddroid/logitech-g435-battery",
        "https://sketchfab.com/3d-models/fone-logitech-g435-",
    ];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("link not allowed".into());
    }
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history(hub: State<Hub>) {
    hub.send(Cmd::ClearHistory);
}

#[tauri::command]
fn get_autostart() -> bool {
    autostart::enabled()
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    autostart::set(enabled)
}

fn main() {
    let start_in_tray = std::env::args().any(|a| a == "--tray");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let handle = app.handle().clone();
            let alert_handle = app.handle().clone();
            let data_dir = app.path().app_data_dir().ok();
            let last_icon = Mutex::new(None);
            let last_tip = Mutex::new(String::new());
            let last_lang = Mutex::new(None);
            let (tx, state) = worker::spawn(
                data_dir,
                move |s| {
                    let _ = handle.emit("hub://state", s);
                    {
                        let mut l = last_lang.lock().unwrap();
                        if *l != Some(s.lang) {
                            *l = Some(s.lang);
                            if let Some(items) = handle.try_state::<tray::Items>() {
                                items.set_lang(s.lang);
                            }
                        }
                    }
                    let Some(t) = handle.tray_by_id(tray::ID) else { return };
                    let key = tray::key(s);
                    let mut icon = last_icon.lock().unwrap();
                    if *icon != Some(key) {
                        *icon = Some(key);
                        let _ = t.set_icon(Some(tray::render(s)));
                    }
                    let tip = tray::tooltip(s);
                    let mut last = last_tip.lock().unwrap();
                    if *last != tip {
                        let _ = t.set_tooltip(Some(&tip));
                        *last = tip;
                    }
                },
                move |percent| {
                    let lang = alert_handle.state::<Hub>().state.lock().unwrap().lang;
                    let (title, body) = i18n::low_battery(lang, percent);
                    let _ = alert_handle.notification().builder().title(title).body(body).show();
                },
            );
            let lang = state.lock().unwrap().lang;
            app.manage(Hub { tx: Mutex::new(tx), state });
            tray::setup(app.handle(), lang)?;
            if !start_in_tray {
                show_window(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            refresh_battery,
            set_poll,
            set_volume,
            set_mute,
            set_alert,
            set_language,
            set_auto_update,
            get_diagnostics,
            copy_text,
            open_url,
            clear_history,
            get_autostart,
            set_autostart
        ])
        .build(tauri::generate_context!())
        .expect("failed to start G435 Hub");

    app.run(|_app, event| {
        // закрытие последнего окна не завершает программу: она остаётся в трее
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            api.prevent_exit();
        }
    });
}
