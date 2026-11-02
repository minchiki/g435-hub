//! HID-обмен с донглом G435 046D:0ACB: vendor collection FFC0, report 6.
//!
//! Протокол из deddroid/logitech-g435-battery (MIT) и исследования endes; тот же,
//! что в scripts/battery.py и docs/battery.md. Отправляются только: вход/выход моста,
//! REMOTE_GET_CONNECT_STATUS, REMOTE_GET_MODE, REMOTE_SET_MODE 1, OTA GET_BATTERY.

use std::ffi::c_void;
use std::time::{Duration, Instant};
use windows::Win32::Devices::DeviceAndDriverInstallation::*;
use windows::Win32::Devices::HumanInterfaceDevice::*;
use windows::Win32::Foundation::*;
use windows::Win32::Storage::FileSystem::*;
use windows::Win32::System::IO::*;
use windows::Win32::System::Threading::*;
use windows::core::PCWSTR;

const REPORT_ID: u8 = 6;
const FEATURE_LEN: usize = 64;
const INPUT_LEN: usize = 8;
const ENTER_BOOTLOADER: [u8; 2] = [0x01, 0x03];
const EXIT_BOOTLOADER: [u8; 2] = [0x08, 0x03];
const SEND_COMMAND: [u8; 2] = [0x04, 0x03];
const CAT_OTA: u8 = 0x06;
const CAT_WIRELESS: u8 = 0x0e;
const GET_MODE: u8 = 0xe0;
const SET_MODE: u8 = 0xe1;
const GET_CONNECT: u8 = 0xe3;

#[derive(Debug)]
pub enum Error {
    NotFound,
    HeadsetOff,
    NoReply,
    Win(windows::core::Error),
}

impl Error {
    /// Stable code for the UI, which translates it: the text of the message is never matched.
    pub fn code(&self) -> String {
        match self {
            Error::NotFound => "dongle_missing".into(),
            Error::HeadsetOff => "headset_off".into(),
            Error::NoReply => "no_reply".into(),
            Error::Win(e) => format!("hid_error:{}", e.message()),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Error::NotFound => write!(f, "dongle not found"),
            Error::HeadsetOff => write!(f, "headset is off"),
            Error::NoReply => write!(f, "no reply from the headset"),
            Error::Win(e) => write!(f, "HID error: {}", e.message()),
        }
    }
}

impl From<windows::core::Error> for Error {
    fn from(e: windows::core::Error) -> Self {
        Error::Win(e)
    }
}

type Result<T> = std::result::Result<T, Error>;

/// Напряжение батареи (мВ) и оценка процента по кривой Li-Po.
pub fn millivolts_to_percent(mv: u16) -> u8 {
    // Верх (≥ 3800 мВ) — кривая Li-Po из deddroid/logitech-g435-battery. Низ откалиброван
    // по разрядке нашей G435 в ночь на 2026-11-02 (простой без звука): время до самовыключения
    // на 3318 мВ в долях паспортных 18 ч. См. docs/battery.md.
    const CURVE: [(u16, u8); 22] = [
        (4200, 100),
        (4150, 95),
        (4100, 90),
        (4050, 85),
        (4000, 80),
        (3950, 75),
        (3900, 70),
        (3850, 62),
        (3800, 55),
        (3750, 41),
        (3720, 34),
        (3705, 29),
        (3700, 27),
        (3690, 17),
        (3675, 11),
        (3650, 9),
        (3600, 7),
        (3550, 5),
        (3500, 4),
        (3450, 2),
        (3400, 1),
        (3300, 0),
    ];
    if mv >= CURVE[0].0 {
        return 100;
    }
    for w in CURVE.windows(2) {
        let ((hi_mv, hi_p), (lo_mv, lo_p)) = (w[0], w[1]);
        if mv >= lo_mv {
            let t = (mv - lo_mv) as f32 / (hi_mv - lo_mv) as f32;
            return (lo_p as f32 + t * (hi_p - lo_p) as f32).round() as u8;
        }
    }
    0
}

fn parse_remote(buf: &[u8], cmd: u8) -> Option<u8> {
    buf.windows(4).find(|w| w[0] == 0x02 && w[1] == 0x00 && w[2] == cmd).map(|w| w[3])
}

fn parse_battery(buf: &[u8]) -> Option<u16> {
    buf.windows(7).find_map(|w| {
        if w[0] == 0x07 && w[1] == 0x00 && w[2] == CAT_OTA && w[3] & 0x80 != 0 && w[4] == 0 {
            let mv = u16::from_le_bytes([w[5], w[6]]);
            (2500..=4600).contains(&mv).then_some(mv)
        } else {
            None
        }
    })
}

/// Путь к коллекции FFC0 донгла 0ACB (на Windows каждая TLC — отдельный путь).
fn find_vendor_path() -> Option<Vec<u16>> {
    unsafe {
        let guid = HidD_GetHidGuid();
        let info =
            SetupDiGetClassDevsW(Some(&guid), PCWSTR::null(), None, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE).ok()?;
        let mut found = None;
        let mut index = 0;
        loop {
            let mut iface =
                SP_DEVICE_INTERFACE_DATA { cbSize: size_of::<SP_DEVICE_INTERFACE_DATA>() as u32, ..Default::default() };
            if SetupDiEnumDeviceInterfaces(info, None, &guid, index, &mut iface).is_err() {
                break;
            }
            index += 1;
            let mut needed = 0u32;
            let _ = SetupDiGetDeviceInterfaceDetailW(info, &iface, None, 0, Some(&mut needed), None);
            let mut buf = vec![0u8; needed as usize];
            let detail = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
            (*detail).cbSize = size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
            if SetupDiGetDeviceInterfaceDetailW(info, &iface, Some(detail), needed, None, None).is_err() {
                continue;
            }
            let path_ptr = std::ptr::addr_of!((*detail).DevicePath) as *const u16;
            let len = (0..).take_while(|&i| *path_ptr.add(i) != 0).count();
            let path: Vec<u16> = std::slice::from_raw_parts(path_ptr, len + 1).to_vec();
            if !String::from_utf16_lossy(&path).to_lowercase().contains("vid_046d&pid_0acb") {
                continue;
            }
            let Ok(h) = CreateFileW(
                PCWSTR(path.as_ptr()),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            ) else {
                continue;
            };
            let mut ppd = PHIDP_PREPARSED_DATA::default();
            let mut caps = HIDP_CAPS::default();
            let ok = HidD_GetPreparsedData(h, &mut ppd) && HidP_GetCaps(ppd, &mut caps).is_ok();
            if ok {
                let _ = HidD_FreePreparsedData(ppd);
            }
            let _ = CloseHandle(h);
            if ok && caps.UsagePage == 0xffc0 {
                found = Some(path);
                break;
            }
        }
        let _ = SetupDiDestroyDeviceInfoList(info);
        found
    }
}

struct Dongle {
    handle: HANDLE,
    event: HANDLE,
    seq: u8,
}

impl Drop for Dongle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.event);
            let _ = CloseHandle(self.handle);
        }
    }
}

impl Dongle {
    fn open() -> Result<Self> {
        let path = find_vendor_path().ok_or(Error::NotFound)?;
        unsafe {
            let handle = CreateFileW(
                PCWSTR(path.as_ptr()),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED,
                None,
            )?;
            let event = CreateEventW(None, true, false, PCWSTR::null())?;
            Ok(Dongle { handle, event, seq: 1 })
        }
    }

    fn read_input(&self, timeout_ms: u32) -> Option<[u8; INPUT_LEN]> {
        let mut buf = [0u8; INPUT_LEN];
        let mut ov = OVERLAPPED { hEvent: self.event, ..Default::default() };
        let mut n = 0u32;
        unsafe {
            if ReadFile(self.handle, Some(&mut buf), None, Some(&mut ov)).is_err() {
                if GetLastError() != ERROR_IO_PENDING {
                    return None;
                }
                if WaitForSingleObject(self.event, timeout_ms) != WAIT_OBJECT_0 {
                    let _ = CancelIo(self.handle);
                    let _ = GetOverlappedResult(self.handle, &ov, &mut n, true);
                    return None;
                }
            }
            GetOverlappedResult(self.handle, &ov, &mut n, true).ok()?;
        }
        Some(buf)
    }

    /// Feature-отчёт мосту, затем ACK на input endpoint (кнопки громкости пропускаются).
    fn bridge(&self, op: &[u8; 2], body: &[u8]) -> Result<u8> {
        let mut report = [0u8; FEATURE_LEN];
        report[0] = REPORT_ID;
        report[1..3].copy_from_slice(op);
        report[3..3 + body.len()].copy_from_slice(body);
        unsafe {
            if !HidD_SetFeature(self.handle, report.as_ptr() as *const c_void, FEATURE_LEN as u32) {
                return Err(windows::core::Error::from_thread().into());
            }
        }
        let deadline = Instant::now() + Duration::from_millis(800);
        while Instant::now() < deadline {
            if let Some(buf) = self.read_input(100)
                && buf[0] == REPORT_ID
            {
                return Ok(buf[1]);
            }
        }
        Err(Error::NoReply)
    }

    fn feature(&self) -> Result<[u8; FEATURE_LEN]> {
        let mut buf = [0u8; FEATURE_LEN];
        buf[0] = REPORT_ID;
        unsafe {
            if !HidD_GetFeature(self.handle, buf.as_mut_ptr() as *mut c_void, FEATURE_LEN as u32) {
                return Err(windows::core::Error::from_thread().into());
            }
        }
        Ok(buf)
    }

    fn drain(&self) -> Result<()> {
        for _ in 0..16 {
            if self.feature()?[1] == 0xff {
                break;
            }
        }
        Ok(())
    }

    fn query<T>(
        &mut self,
        category: u8,
        len: u8,
        payload: &[u8],
        parse: impl Fn(&[u8]) -> Option<T>,
    ) -> Result<Option<T>> {
        let mut cmd = vec![0x50, 0x41, category, self.seq, len];
        cmd.extend_from_slice(payload);
        self.seq = self.seq % 127 + 1;
        let mut msg = vec![cmd.len() as u8];
        msg.extend_from_slice(&cmd);
        self.bridge(&SEND_COMMAND, &msg)?;
        let deadline = Instant::now() + Duration::from_millis(1500);
        while Instant::now() < deadline {
            let buf = self.feature()?;
            if buf[1] != 0xff {
                if let Some(v) = parse(&buf) {
                    return Ok(Some(v));
                }
                continue;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        Ok(None)
    }
}

/// Режим моста всегда закрывается, даже при ошибке.
struct Session(Dongle);

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.0.bridge(&EXIT_BOOTLOADER, &[]);
    }
}

/// Чтение с одним повтором: мост иногда не отвечает с первого раза (например, сразу
/// после воспроизведения). «Гарнитура выключена» и «донгл не найден» не повторяются.
pub fn read_battery() -> Result<u16> {
    match read_battery_once() {
        Err(Error::NoReply | Error::Win(_)) => {
            std::thread::sleep(Duration::from_millis(1200));
            read_battery_once()
        }
        r => r,
    }
}

/// Полное чтение: связь, режим (при необходимости ставится 1), три замера напряжения
/// за один сеанс моста; возвращается медиана — одиночный замер шумит на десятки мВ.
fn read_battery_once() -> Result<u16> {
    let dongle = Dongle::open()?;
    dongle.bridge(&ENTER_BOOTLOADER, &[])?;
    let mut s = Session(dongle);
    s.0.drain()?;
    let connected = s.0.query(CAT_WIRELESS, 1, &[GET_CONNECT], |b| parse_remote(b, GET_CONNECT))?;
    if connected == Some(0) {
        return Err(Error::HeadsetOff);
    }
    let mode = s.0.query(CAT_WIRELESS, 1, &[GET_MODE], |b| parse_remote(b, GET_MODE))?;
    if mode != Some(1) {
        s.0.query(CAT_WIRELESS, 2, &[SET_MODE, 0x01], |_| Some(()))?;
    }
    let mut samples = Vec::with_capacity(3);
    for _ in 0..3 {
        if let Some(mv) = s.0.query(CAT_OTA, 1, &[0x00, 0x31], parse_battery)? {
            samples.push(mv);
        }
    }
    median(&mut samples).ok_or(Error::NoReply)
}

fn median(v: &mut [u16]) -> Option<u16> {
    v.sort_unstable();
    v.get(v.len() / 2).copied()
}

/// Донгл подключён к USB (без обмена с устройством).
pub fn dongle_present() -> bool {
    find_vendor_path().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    #[test]
    fn parses_replies() {
        // Ответ нашего донгла 2026-11-01 (docs/battery.md).
        let b = hex("06504901c6272c1e000700068400b80e0000ffff");
        assert_eq!(parse_battery(&b), Some(3768));
        assert_eq!(parse_battery(&hex("06504901c0d64300000700068200d2000000ffff")), None);
        assert_eq!(parse_remote(&hex("0650490ec5000000000200e000ffff"), GET_MODE), Some(0));
        assert_eq!(parse_remote(&hex("0650490ec4000000000200e301ffff"), GET_CONNECT), Some(1));
    }

    #[test]
    fn percent_curve() {
        assert_eq!(millivolts_to_percent(4300), 100);
        assert_eq!(millivolts_to_percent(3768), 46);
        assert_eq!(millivolts_to_percent(3600), 7);
        assert_eq!(millivolts_to_percent(3321), 0);
        assert_eq!(millivolts_to_percent(3300), 0);
    }
}
