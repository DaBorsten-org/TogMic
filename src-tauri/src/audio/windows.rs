use super::{AudioController, AudioDevice};
use std::cell::RefCell;
use std::collections::HashMap;
use std::ptr;
use std::result::Result as StdResult;
use std::sync::Arc;
use windows::core::{implement, ComInterface, Interface, GUID, HSTRING};
use windows::Win32::Foundation::*;
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{AUDIO_VOLUME_NOTIFICATION_DATA, IMMDeviceEnumerator};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
use windows::Win32::System::Com::*;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, PROPERTYKEY};

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
    query_interface: unsafe extern "system" fn(
        *const std::ffi::c_void,
        *const GUID,
        *mut *mut std::ffi::c_void,
    ) -> i32,
    add_ref: unsafe extern "system" fn(*const std::ffi::c_void) -> u32,
    release: unsafe extern "system" fn(*const std::ffi::c_void) -> u32,
    // IMMDevice methods
    activate: unsafe extern "system" fn(
        *const std::ffi::c_void,    // this
        *const GUID,                // iid
        u32,                        // dwClsCtx
        *const std::ffi::c_void,    // pActivationParams
        *mut *mut std::ffi::c_void, // ppInterface
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
        &mut ppv as *mut *mut std::ffi::c_void,
    );

    if hr < 0 {
        return Err(format!(
            "IMMDevice::Activate failed with HRESULT: 0x{:08X}",
            hr
        ));
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

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
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
        enumerator
            .GetDefaultAudioEndpoint(eCapture, eConsole)
            .map_err(|e| format!("Failed to get default device: {}", e))?
    } else {
        let id_wide = HSTRING::from(device_id);
        enumerator
            .GetDevice(&id_wide)
            .map_err(|e| format!("Failed to get device: {}", e))?
    };

    let endpoint = activate_audio_endpoint(&device)?;

    // Cache the endpoint for subsequent calls on this thread
    THREAD_ENDPOINT_CACHE.with(|cache| {
        cache
            .borrow_mut()
            .insert(device_id.to_string(), endpoint.clone());
    });

    Ok(endpoint)
}

unsafe fn read_device_property(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<String> {
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

            let collection = enumerator
                .EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?;

            let count = collection
                .GetCount()
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
                let device = collection
                    .Item(i)
                    .map_err(|e| format!("Failed to get device {}: {}", i, e))?;

                let id_pwstr = device
                    .GetId()
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
            let endpoint = get_cached_endpoint_for_id(device_id)?;
            match endpoint.GetMute() {
                Ok(muted) => Ok(muted.as_bool()),
                Err(e) => {
                    // Remove stale cache entry so the next call tries a fresh endpoint
                    THREAD_ENDPOINT_CACHE.with(|cache| {
                        cache.borrow_mut().remove(device_id);
                    });
                    Err(format!("Device unavailable: {}", e))
                }
            }
        }
    }

    fn set_mute_state(&self, device_id: &str, muted: bool) -> StdResult<(), String> {
        unsafe {
            let endpoint = get_cached_endpoint_for_id(device_id)?;
            match endpoint.SetMute(BOOL::from(muted), ptr::null()) {
                Ok(()) => Ok(()),
                Err(e) => {
                    // Remove stale cache entry so the next call tries a fresh endpoint
                    THREAD_ENDPOINT_CACHE.with(|cache| {
                        cache.borrow_mut().remove(device_id);
                    });
                    Err(format!("Device unavailable: {}", e))
                }
            }
        }
    }
}

// Clear the per-thread endpoint cache (call when devices change)
pub fn clear_endpoint_cache() {
    THREAD_ENDPOINT_CACHE.with(|cache| {
        cache.borrow_mut().clear();
    });
}

/// Enumerate active capture device IDs on the current thread.
/// Uses the cached THREAD_ENUMERATOR — safe to call from the COM STA listener thread
/// where the enumerator is already initialized by setup_listeners().
pub fn enumerate_capture_device_ids() -> StdResult<Vec<String>, String> {
    unsafe {
        let enumerator = thread_enumerator()?;
        let collection = enumerator
            .EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
            .map_err(|e| format!("EnumAudioEndpoints failed: {}", e))?;
        let count = collection
            .GetCount()
            .map_err(|e| format!("GetCount failed: {}", e))?;
        let mut ids = Vec::with_capacity(count as usize);
        for i in 0..count {
            if let Ok(device) = collection.Item(i) {
                if let Ok(id_pwstr) = device.GetId() {
                    let id = id_pwstr.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(id_pwstr.0 as *const _));
                    ids.push(id);
                }
            }
        }
        Ok(ids)
    }
}

// ---------------------------------------------------------------------------
// IAudioEndpointVolumeCallback — fires when any app changes mute on a device
// ---------------------------------------------------------------------------

pub type MuteChangedFn = Arc<dyn Fn(bool) + Send + Sync>;
pub type DevicesChangedFn = Arc<dyn Fn() + Send + Sync>;

#[implement(IAudioEndpointVolumeCallback)]
struct MuteCallback {
    on_mute_changed: MuteChangedFn,
}

impl IAudioEndpointVolumeCallback_Impl for MuteCallback {
    fn OnNotify(&self, data: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
        if data.is_null() {
            return Ok(());
        }
        let muted = unsafe { (*data).bMuted.as_bool() };
        (self.on_mute_changed)(muted);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// IMMNotificationClient — fires on device plug/unplug/state changes
// ---------------------------------------------------------------------------

#[implement(IMMNotificationClient)]
struct DeviceNotificationClient {
    on_devices_changed: DevicesChangedFn,
}

impl IMMNotificationClient_Impl for DeviceNotificationClient {
    fn OnDeviceStateChanged(
        &self,
        _pwstrid: &windows::core::PCWSTR,
        _dwnewstate: u32,
    ) -> windows::core::Result<()> {
        (self.on_devices_changed)();
        Ok(())
    }

    fn OnDeviceAdded(&self, _pwstrid: &windows::core::PCWSTR) -> windows::core::Result<()> {
        (self.on_devices_changed)();
        Ok(())
    }

    fn OnDeviceRemoved(&self, _pwstrid: &windows::core::PCWSTR) -> windows::core::Result<()> {
        (self.on_devices_changed)();
        Ok(())
    }

    fn OnDefaultDeviceChanged(
        &self,
        flow: EDataFlow,
        _role: ERole,
        _pwstrdefaultdeviceid: &windows::core::PCWSTR,
    ) -> windows::core::Result<()> {
        // Only care about capture (microphone) devices
        if flow == eCapture {
            (self.on_devices_changed)();
        }
        Ok(())
    }

    fn OnPropertyValueChanged(
        &self,
        _pwstrid: &windows::core::PCWSTR,
        _key: &windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY,
    ) -> windows::core::Result<()> {
        Ok(())
    }
}

/// Registered callbacks kept alive for the lifetime of the listener thread.
/// Dropping these unregisters them automatically.
struct AudioListenerHandles {
    enumerator: IMMDeviceEnumerator,
    notification_client: IMMNotificationClient,
    /// (endpoint, callback) pairs — one per monitored device
    endpoint_callbacks: Vec<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)>,
}

impl Drop for AudioListenerHandles {
    fn drop(&mut self) {
        unsafe {
            let _ = self
                .enumerator
                .UnregisterEndpointNotificationCallback(&self.notification_client);
            for (ep, cb) in &self.endpoint_callbacks {
                let _ = ep.UnregisterControlChangeNotify(cb);
            }
        }
    }
}

/// Spawn a dedicated STA thread that registers COM callbacks for:
///   - mute state changes on all active capture devices
///   - device plug/unplug events
///
/// The `on_mute_changed` closure is called from the COM callback thread whenever
/// any monitored device's mute state changes.
/// The `on_devices_changed` closure is called when the device list changes.
///
/// Returns immediately; the listener thread runs for the lifetime of the process.
pub fn start_audio_listeners(
    on_mute_changed: MuteChangedFn,
    on_devices_changed: DevicesChangedFn,
) {
    std::thread::spawn(move || {
        // STA is required for IMMNotificationClient callbacks on Windows
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }

        // Channel used by the DeviceNotificationClient callback to signal this
        // thread that the device list changed and listeners should be re-registered.
        let (tx, rx) = std::sync::mpsc::channel::<()>();

        // Wrap on_devices_changed to also signal re-registration
        let on_devices_changed_signaling: DevicesChangedFn = {
            let on_devices_changed = on_devices_changed.clone();
            Arc::new(move || {
                on_devices_changed();
                let _ = tx.send(());
            })
        };

        // Keep current_handles in scope so registered callbacks live as long as this thread.
        let mut _handles = match setup_listeners(&on_mute_changed, &on_devices_changed_signaling) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("[audio] Failed to set up COM listeners: {}", e);
                return;
            }
        };

        loop {
            // Wait for a device-change signal instead of polling every 2 s.
            // A 30 s timeout acts as a safety net to catch edge cases.
            let _ = rx.recv_timeout(std::time::Duration::from_secs(30));
            // Drain any additional queued signals to avoid redundant re-registrations
            while rx.try_recv().is_ok() {}

            if let Ok(new_handles) =
                setup_listeners(&on_mute_changed, &on_devices_changed_signaling)
            {
                _handles = new_handles;
            }
        }
    });
}

fn setup_listeners(
    on_mute_changed: &MuteChangedFn,
    on_devices_changed: &DevicesChangedFn,
) -> StdResult<AudioListenerHandles, String> {
    unsafe {
        // Use thread_enumerator() so the STA thread's THREAD_ENUMERATOR cache is populated.
        // This means enumerate_capture_device_ids() called from on_devices_changed callbacks
        // (on this same thread) reuses the cached enumerator instead of creating a second one.
        let enumerator = thread_enumerator()
            .map_err(|e| format!("CoCreateInstance failed: {}", e))?;

        // Register device notification client
        let notification_client: IMMNotificationClient =
            DeviceNotificationClient {
                on_devices_changed: on_devices_changed.clone(),
            }
            .into();
        enumerator
            .RegisterEndpointNotificationCallback(&notification_client)
            .map_err(|e| format!("RegisterEndpointNotificationCallback failed: {}", e))?;

        // Enumerate all active capture devices and register a mute callback on each
        let collection = enumerator
            .EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
            .map_err(|e| format!("EnumAudioEndpoints failed: {}", e))?;
        let count = collection
            .GetCount()
            .map_err(|e| format!("GetCount failed: {}", e))?;

        let mut endpoint_callbacks = Vec::new();

        for i in 0..count {
            let device = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };
            let endpoint = match activate_audio_endpoint(&device) {
                Ok(ep) => ep,
                Err(_) => continue,
            };
            let cb: IAudioEndpointVolumeCallback = MuteCallback {
                on_mute_changed: on_mute_changed.clone(),
            }
            .into();
            if endpoint.RegisterControlChangeNotify(&cb).is_ok() {
                endpoint_callbacks.push((endpoint, cb));
            }
        }

        // Also register on the default device (in case it's not in the collection)
        if let Ok(default_dev) = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole) {
            if let Ok(endpoint) = activate_audio_endpoint(&default_dev) {
                let cb: IAudioEndpointVolumeCallback = MuteCallback {
                    on_mute_changed: on_mute_changed.clone(),
                }
                .into();
                if endpoint.RegisterControlChangeNotify(&cb).is_ok() {
                    endpoint_callbacks.push((endpoint, cb));
                }
            }
        }

        Ok(AudioListenerHandles {
            enumerator,
            notification_client,
            endpoint_callbacks,
        })
    }
}
