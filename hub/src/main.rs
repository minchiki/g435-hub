#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! G435 Hub — лёгкая замена Logitech G Hub для гарнитуры G435 (донгл 046D:0ACB).
//! Rust: HID, Core Audio и трей; интерфейс — ui/ в WebView2 (three.js).
//! Окно при закрытии уничтожается целиком (вместе с WebView2), в фоне остаётся трей.

mod audio;
mod autostart;
mod battery;
mod hid;
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
    if let Some(cfg) = app.config().app.windows.first() {
        if let Ok(w) = WebviewWindowBuilder::from_config(app, cfg).and_then(|b| b.build()) {
            let _ = w.set_focus();
        }
    }
}

fn kind(name: &str) -> Result<Kind, String> {
    match name {
        "headphones" => Ok(Kind::Headphones),
        "microphone" => Ok(Kind::Microphone),
        _ => Err(format!("неизвестное устройство: {name}")),
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
        .setup(move |app| {
            let handle = app.handle().clone();
            let alert_handle = app.handle().clone();
            let data_dir = app.path().app_data_dir().ok();
            let last_icon = Mutex::new(None);
            let last_tip = Mutex::new(String::new());
            let (tx, state) = worker::spawn(data_dir, move |s| {
                let _ = handle.emit("hub://state", s);
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
            }, move |percent| {
                let _ = alert_handle.notification().builder()
                    .title(format!("G435: заряд {percent}%"))
                    .body("Поставьте гарнитуру на зарядку.")
                    .show();
            });
            app.manage(Hub { tx: Mutex::new(tx), state });
            tray::setup(app.handle())?;
            if !start_in_tray {
                show_window(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state, refresh_battery, set_poll, set_volume, set_mute, set_alert, clear_history,
            get_autostart, set_autostart
        ])
        .build(tauri::generate_context!())
        .expect("ошибка запуска G435 Hub");

    app.run(|_app, event| {
        // закрытие последнего окна не завершает программу: она остаётся в трее
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            api.prevent_exit();
        }
    });
}
