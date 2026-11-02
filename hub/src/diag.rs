//! Text for bug reports: versions, dongle state, recent readings. Contains no personal data:
//! no user name, no paths, no device serial numbers.

use crate::worker::State;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::*;
use windows::core::{HSTRING, w};

fn reg_string(name: &str) -> Option<String> {
    let name = HSTRING::from(name);
    let mut buf = [0u16; 128];
    let mut bytes = (buf.len() * 2) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
            &name,
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut bytes),
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    let len = (bytes as usize / 2).saturating_sub(1).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
}

fn windows_version() -> String {
    let name = reg_string("ProductName").unwrap_or_else(|| "Windows".into());
    let display = reg_string("DisplayVersion").unwrap_or_default();
    let build = reg_string("CurrentBuildNumber").unwrap_or_default();
    // the registry still says "Windows 10" on Windows 11; builds from 22000 are Windows 11
    let name =
        if build.parse::<u32>().is_ok_and(|b| b >= 22000) { name.replace("Windows 10", "Windows 11") } else { name };
    format!("{name} {display} (build {build})").replace("  ", " ")
}

pub fn report(version: &str, webview: Option<String>, s: &State) -> String {
    let mut out = String::new();
    let mut line = |t: String| {
        out.push_str(&t);
        out.push('\n');
    };
    line(format!("G435 Hub {version}"));
    line(format!("Windows: {}", windows_version()));
    line(format!("WebView2: {}", webview.as_deref().unwrap_or("unknown")));
    line(format!("Language: {:?} (setting {:?})", s.lang, s.settings.language));
    line(format!("Dongle 046D:0ACB present: {}", s.dongle));
    line(format!("Last error: {}", s.error.as_deref().unwrap_or("none")));
    match &s.battery {
        Some(b) => line(format!(
            "Battery: {} mV, {}%, charging={}, hours_left={:?} ({:?})",
            b.millivolts,
            b.percent,
            b.charging,
            b.hours_left.map(|h| (h * 10.0).round() / 10.0),
            b.hours_source
        )),
        None => line("Battery: no reading".into()),
    }
    line(format!("Poll: {:?} min, alert at {}%", s.settings.poll_minutes, s.settings.alert_percent));
    line(format!("Readings in the last 24 h: {}", s.history.len()));
    line("Last readings (minutes ago, mV):".into());
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    for (at, mv) in s.history.iter().rev().take(15).rev() {
        line(format!("  -{:>4}  {mv}", now.saturating_sub(*at) / 60_000));
    }
    out
}

/// Puts text on the Windows clipboard (works regardless of window focus).
pub fn copy_to_clipboard(text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
    const CF_UNICODETEXT: u32 = 13;
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        OpenClipboard(None).map_err(|e| e.message())?;
        let result = (|| -> windows::core::Result<()> {
            EmptyClipboard()?;
            let mem = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
            let dst = GlobalLock(mem) as *mut u16;
            if dst.is_null() {
                return Err(windows::core::Error::from_thread());
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
            let _ = GlobalUnlock(mem);
            SetClipboardData(CF_UNICODETEXT, Some(HANDLE(mem.0)))?;
            Ok(())
        })();
        let _ = CloseClipboard();
        result.map_err(|e| e.message())
    }
}
