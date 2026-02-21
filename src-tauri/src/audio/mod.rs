use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsAudioController as PlatformAudioController;
#[cfg(target_os = "windows")]
pub use windows::clear_endpoint_cache;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOSAudioController as PlatformAudioController;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::LinuxAudioController as PlatformAudioController;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub trait AudioController {
    fn new() -> Result<Self, String>
    where
        Self: Sized;
    
    /// Initialize audio subsystem for the current thread (e.g., COM on Windows).
    /// Must be called before using audio methods on a new thread.
    fn init_thread() -> Result<(), String>
    where
        Self: Sized,
    {
        Ok(())
    }
    
    fn enumerate_input_devices(&self) -> Result<Vec<AudioDevice>, String>;
    
    fn get_mute_state(&self, device_id: &str) -> Result<bool, String>;
    
    fn set_mute_state(&self, device_id: &str, muted: bool) -> Result<(), String>;
}
