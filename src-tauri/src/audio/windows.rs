use super::{AudioController, AudioDevice};
use windows::core::{HSTRING, Interface, ComInterface, GUID};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Audio::Endpoints::*;
use windows::Win32::System::Com::*;
use windows::Win32::Foundation::*;
use std::result::Result as StdResult;
use std::ptr;

pub struct WindowsAudioController;

// Manual FFI binding for IMMDevice::Activate since it's not properly exposed
#[repr(C)]
struct IMMDeviceVtbl {
    // IUnknown methods
    query_interface: unsafe extern "system" fn(*const std::ffi::c_void, *const GUID, *mut *mut std::ffi::c_void) -> i32,
    add_ref: unsafe extern "system" fn(*const std::ffi::c_void) -> u32,
    release: unsafe extern "system" fn(*const std::ffi::c_void) -> u32,
    // IMMDevice methods
    activate: unsafe extern "system" fn(
        *const std::ffi::c_void,  // this
        *const GUID,              // iid
        u32,                      // dwClsCtx
        *const std::ffi::c_void,  // pActivationParams
        *mut *mut std::ffi::c_void // ppInterface
    ) -> i32,
    // ... other methods we don't need
}

unsafe fn activate_audio_endpoint(device: &IMMDevice) -> StdResult<IAudioEndpointVolume, String> {
    let device_ptr = device.as_raw() as *const *const IMMDeviceVtbl;
    let vtbl = *device_ptr;
    
    let iid = &IAudioEndpointVolume::IID;
    let mut ppv: *mut std::ffi::c_void = std::ptr::null_mut();
    
    let hr = ((*vtbl).activate)(
        device.as_raw() as *const std::ffi::c_void,
        iid as *const GUID,
        CLSCTX_ALL.0,
        std::ptr::null(),
        &mut ppv as *mut *mut std::ffi::c_void
    );
    
    if hr < 0 {
        return Err(format!("IMMDevice::Activate failed with HRESULT: 0x{:08X}", hr));
    }
    
    if ppv.is_null() {
        return Err("Activate returned null pointer".to_string());
    }
    
    Ok(IAudioEndpointVolume::from_raw(ppv))
}

impl AudioController for WindowsAudioController {
    fn new() -> StdResult<Self, String> {
        // COM is already initialized by Tauri, so we don't need to initialize it here
        Ok(WindowsAudioController)
    }

    fn enumerate_input_devices(&self) -> StdResult<Vec<AudioDevice>, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

            let collection = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?;

            let count = collection.GetCount()
                .map_err(|e| format!("Failed to get device count: {}", e))?;

            let default_device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).ok();
            let default_id = if let Some(ref dev) = default_device {
                dev.GetId().ok().map(|id| {
                    let id_str = id.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(id.0 as *const _));
                    id_str
                })
            } else {
                None
            };

            let mut devices = Vec::new();

            for i in 0..count {
                let device = collection.Item(i)
                    .map_err(|e| format!("Failed to get device {}: {}", i, e))?;

                let id_pwstr = device.GetId()
                    .map_err(|e| format!("Failed to get device ID: {}", e))?;
                let id = id_pwstr.to_string().unwrap_or_default();
                CoTaskMemFree(Some(id_pwstr.0 as *const _));

                // Try to get friendly name, fallback to generic name
                let name = format!("Microphone {}", i + 1);

                let is_default = default_id.as_ref().map_or(false, |def_id| def_id == &id);

                devices.push(AudioDevice {
                    id,
                    name,
                    is_default,
                });
            }

            Ok(devices)
        }
    }

    fn get_mute_state(&self, device_id: &str) -> StdResult<bool, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

            let device = if device_id == "default-mic" || device_id.is_empty() {
                enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
                    .map_err(|e| format!("Failed to get default device: {}", e))?
            } else {
                let id_wide = HSTRING::from(device_id);
                enumerator.GetDevice(&id_wide)
                    .map_err(|e| format!("Failed to get device: {}", e))?
            };

            // Get IAudioEndpointVolume interface
            let endpoint = activate_audio_endpoint(&device)?;

            let muted = endpoint.GetMute()
                .map_err(|e| format!("Failed to get mute state: {}", e))?;

            Ok(muted.as_bool())
        }
    }

    fn set_mute_state(&self, device_id: &str, muted: bool) -> StdResult<(), String> {
        println!("set_mute_state called: device_id='{}', muted={}", device_id, muted);
        
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

            let device = if device_id == "default-mic" || device_id.is_empty() {
                println!("Using default microphone endpoint");
                enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
                    .map_err(|e| format!("Failed to get default device: {}", e))?
            } else {
                println!("Using specific device: {}", device_id);
                let id_wide = HSTRING::from(device_id);
                enumerator.GetDevice(&id_wide)
                    .map_err(|e| format!("Failed to get device: {}", e))?
            };

            // Get IAudioEndpointVolume interface
            let endpoint = activate_audio_endpoint(&device)?;
            
            println!("Got endpoint volume interface, setting mute to: {}", muted);

            endpoint.SetMute(BOOL::from(muted), ptr::null())
                .map_err(|e| format!("Failed to set mute state: {}", e))?;

            println!("Successfully set mute state to: {} for device: {}", muted, device_id);
            Ok(())
        }
    }

    fn get_default_input_device(&self) -> StdResult<Option<AudioDevice>, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

            let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
                .map_err(|e| format!("Failed to get default device: {}", e))?;

            let id_pwstr = device.GetId()
                .map_err(|e| format!("Failed to get device ID: {}", e))?;
            let id = id_pwstr.to_string().unwrap_or_default();
            CoTaskMemFree(Some(id_pwstr.0 as *const _));

            Ok(Some(AudioDevice {
                id,
                name: "Default Microphone".to_string(),
                is_default: true,
            }))
        }
    }
}


