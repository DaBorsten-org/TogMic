use super::{AudioController, AudioDevice};
use windows::core::{HSTRING, Interface, ComInterface, GUID};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::Foundation::*;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, PROPERTYKEY};
use windows::Win32::System::Com::StructuredStorage::{
    PropVariantClear,
    PropVariantToStringAlloc,
};
use std::result::Result as StdResult;
use std::ptr;
use std::cell::RefCell;
use std::collections::HashMap;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::IMMDeviceEnumerator;

// Per-thread cached enumerator and endpoint interfaces to reduce COM creation overhead.
thread_local! {
    static THREAD_ENUMERATOR: RefCell<Option<IMMDeviceEnumerator>> = RefCell::new(None);
    static THREAD_ENDPOINT_CACHE: RefCell<HashMap<String, IAudioEndpointVolume>> = RefCell::new(HashMap::new());
}

pub struct WindowsAudioController;

const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 14,
};

const PKEY_DEVICE_DESC: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 2,
};

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

// Get or create a per-thread IMMDeviceEnumerator
unsafe fn thread_enumerator() -> StdResult<IMMDeviceEnumerator, String> {
    // Ensure COM is initialized for this thread
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

    THREAD_ENUMERATOR.with(|cell| {
        if let Some(ref en) = *cell.borrow() {
            return Ok(en.clone());
        }

        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

        *cell.borrow_mut() = Some(enumerator.clone());
        Ok(enumerator)
    })
}

// Get or create a cached endpoint volume for a given device id on this thread
unsafe fn get_cached_endpoint_for_id(device_id: &str) -> StdResult<IAudioEndpointVolume, String> {
    // First try the cache
    if let Some(ep) = THREAD_ENDPOINT_CACHE.with(|cache| cache.borrow().get(device_id).cloned()) {
        return Ok(ep);
    }

    // Need to resolve device and activate endpoint
    let enumerator = thread_enumerator()?;

    let device = if device_id == "default-mic" || device_id.is_empty() {
        enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
            .map_err(|e| format!("Failed to get default device: {}", e))?
    } else {
        let id_wide = HSTRING::from(device_id);
        enumerator.GetDevice(&id_wide)
            .map_err(|e| format!("Failed to get device: {}", e))?
    };

    let endpoint = activate_audio_endpoint(&device)?;

    // Cache the endpoint for subsequent calls on this thread
    THREAD_ENDPOINT_CACHE.with(|cache| {
        cache.borrow_mut().insert(device_id.to_string(), endpoint.clone());
    });

    Ok(endpoint)
}

unsafe fn read_device_property(
    store: &IPropertyStore,
    key: &PROPERTYKEY,
) -> Option<String> {
    let prop = store.GetValue(key).ok()?;

    let value = match PropVariantToStringAlloc(&prop) {
        Ok(value_ptr) => {
            let string_value = value_ptr.to_string().ok();
            CoTaskMemFree(Some(value_ptr.0 as *const _));
            string_value
        }
        Err(_) => None,
    };

    let mut prop = prop;
    let _ = PropVariantClear(&mut prop);
    value
}

unsafe fn get_device_friendly_name(device: &IMMDevice) -> Option<String> {
    let store = device.OpenPropertyStore(STGM_READ).ok()?;

    read_device_property(&store, &PKEY_DEVICE_FRIENDLY_NAME)
        .or_else(|| read_device_property(&store, &PKEY_DEVICE_DESC))
}

impl AudioController for WindowsAudioController {
    fn new() -> StdResult<Self, String> {
        // COM is already initialized by Tauri, so we don't need to initialize it here
        Ok(WindowsAudioController)
    }

    fn init_thread() -> StdResult<(), String> {
        unsafe {
            // Initialize COM for the current thread (needed for background polling threads)
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        Ok(())
    }

    fn enumerate_input_devices(&self) -> StdResult<Vec<AudioDevice>, String> {
        unsafe {
            let enumerator = thread_enumerator()?;

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
                let name = get_device_friendly_name(&device)
                    .unwrap_or_else(|| format!("Microphone {}", i + 1));

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
            // Use per-thread cached endpoint when possible
            let endpoint = get_cached_endpoint_for_id(device_id)?;
            let muted = endpoint.GetMute()
                .map_err(|e| format!("Failed to get mute state: {}", e))?;
            Ok(muted.as_bool())
        }
    }

    fn set_mute_state(&self, device_id: &str, muted: bool) -> StdResult<(), String> {
        // Try to use cached endpoint to avoid recreating COM objects; fall back on direct activation if needed
        unsafe {
            let endpoint_res = get_cached_endpoint_for_id(device_id);

            let endpoint = match endpoint_res {
                Ok(ep) => ep,
                Err(_) => {
                    // Last resort: create enumerator and activate
                    let enumerator = thread_enumerator()?;
                    let device = if device_id == "default-mic" || device_id.is_empty() {
                        enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
                            .map_err(|e| format!("Failed to get default device: {}", e))?
                    } else {
                        let id_wide = HSTRING::from(device_id);
                        enumerator.GetDevice(&id_wide)
                            .map_err(|e| format!("Failed to get device: {}", e))?
                    };
                    activate_audio_endpoint(&device)?
                }
            };

            endpoint.SetMute(BOOL::from(muted), ptr::null())
                .map_err(|e| format!("Failed to set mute state: {}", e))?;

            // Update cache entry in case endpoint pointer changed
            THREAD_ENDPOINT_CACHE.with(|cache| {
                cache.borrow_mut().insert(device_id.to_string(), endpoint.clone());
            });

            Ok(())
        }
    }
}

// Clear the per-thread endpoint cache (call when devices change)
pub fn clear_endpoint_cache() {
    THREAD_ENDPOINT_CACHE.with(|cache| {
        cache.borrow_mut().clear();
    });
}


// IMMNotificationClient support was removed due to dependency version conflicts.


