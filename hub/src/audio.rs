//! Громкость и mute аудиоустройств G435 через Windows Core Audio.
//! Гарнитуру не трогает: это те же регуляторы, что в микшере Windows.

use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::core::GUID;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Headphones,
    Microphone,
}

pub struct Endpoint {
    volume: IAudioEndpointVolume,
    meter: Option<IAudioMeterInformation>,
}

#[derive(Clone, Copy, Default, PartialEq, Debug, serde::Serialize)]
pub struct Level {
    pub volume: f32,
    pub muted: bool,
}

/// Вызывать один раз в рабочем потоке.
pub fn init_com() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

pub fn find(kind: Kind) -> Option<Endpoint> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let flow = match kind {
            Kind::Headphones => eRender,
            Kind::Microphone => eCapture,
        };
        let devices = enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE).ok()?;
        for i in 0..devices.GetCount().ok()? {
            let Ok(device) = devices.Item(i) else { continue };
            let Ok(store): windows::core::Result<IPropertyStore> = device.OpenPropertyStore(STGM_READ) else {
                continue;
            };
            let Ok(name) = store.GetValue(&PKEY_Device_FriendlyName) else { continue };
            if !name.to_string().contains("G435") {
                continue;
            }
            let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
            let meter = device.Activate(CLSCTX_ALL, None).ok();
            return Some(Endpoint { volume, meter });
        }
        None
    }
}

impl Endpoint {
    pub fn level(&self) -> Option<Level> {
        unsafe {
            Some(Level {
                volume: self.volume.GetMasterVolumeLevelScalar().ok()?,
                muted: self.volume.GetMute().ok()?.as_bool(),
            })
        }
    }

    /// Пиковый уровень сигнала сейчас (0..1): по нему видно, играет ли звук.
    pub fn peak(&self) -> f32 {
        self.meter.as_ref().and_then(|m| unsafe { m.GetPeakValue().ok() }).unwrap_or(0.0)
    }

    pub fn set_volume(&self, v: f32) {
        unsafe {
            let _ = self.volume.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), &GUID::zeroed());
        }
    }

    pub fn set_mute(&self, m: bool) {
        unsafe {
            let _ = self.volume.SetMute(m, &GUID::zeroed());
        }
    }
}
