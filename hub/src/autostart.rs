//! Автозапуск с Windows: значение в HKCU\...\Run, старт сразу в трей (`--tray`).

use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::*;
use windows::core::{HSTRING, w};

const RUN_KEY: windows::core::PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
const VALUE: windows::core::PCWSTR = w!("G435 Hub");

fn command() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    Some(format!("\"{}\" --tray", exe.display()))
}

pub fn enabled() -> bool {
    let mut size = 0u32;
    unsafe {
        RegGetValueW(HKEY_CURRENT_USER, RUN_KEY, VALUE, RRF_RT_REG_SZ, None, None, Some(&mut size)) == ERROR_SUCCESS
    }
}

pub fn set(on: bool) -> Result<(), String> {
    let status = unsafe {
        if on {
            let cmd = HSTRING::from(command().ok_or("cannot find the program path")?);
            let bytes = (cmd.len() + 1) * 2;
            RegSetKeyValueW(HKEY_CURRENT_USER, RUN_KEY, VALUE, REG_SZ.0, Some(cmd.as_ptr() as *const _), bytes as u32)
        } else {
            let s = RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN_KEY, VALUE);
            if s == windows::Win32::Foundation::ERROR_FILE_NOT_FOUND { ERROR_SUCCESS } else { s }
        }
    };
    if status == ERROR_SUCCESS { Ok(()) } else { Err(format!("registry error {}", status.0)) }
}
