use std::fs;

/// Embedded WAV files
const MUTE_WAV: &[u8] = include_bytes!("../resources/mute.wav");
const UNMUTE_WAV: &[u8] = include_bytes!("../resources/unmute.wav");

/// Initialize the sound system (no-op now, kept for API compatibility)
pub fn init() {}

/// Try to load an external sound file from the executable directory
fn load_external_sound(filename: &str) -> Option<Vec<u8>> {
    // Get the directory where the executable is located
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    let sound_path = exe_dir.join(filename);
    
    // Try to read the file
    fs::read(sound_path).ok()
}

/// Play a WAV buffer using the native Windows PlaySound API (async, no resampling)
#[cfg(target_os = "windows")]
fn play_wav_static(data: &'static [u8]) {
    use windows::Win32::Media::Audio::{
        PlaySoundA, SND_ASYNC, SND_MEMORY, SND_NODEFAULT,
    };
    use windows::Win32::Foundation::HMODULE;

    unsafe {
        // SND_MEMORY: data points to in-memory WAV
        // SND_ASYNC: play asynchronously (don't block)
        // SND_NODEFAULT: don't play default sound on error
        let _ = PlaySoundA(
            windows::core::PCSTR(data.as_ptr()),
            HMODULE::default(),
            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
        );
    }
}

/// Play a WAV buffer from a Vec using the native Windows PlaySound API
#[cfg(target_os = "windows")]
fn play_wav_dynamic(data: Vec<u8>) {
    use windows::Win32::Media::Audio::{
        PlaySoundA, SND_ASYNC, SND_MEMORY, SND_NODEFAULT,
    };
    use windows::Win32::Foundation::HMODULE;

    // We need to leak the data to ensure it's valid for the async playback
    // This is acceptable for infrequent sound playback
    let data_ptr = Box::leak(data.into_boxed_slice());
    
    unsafe {
        let _ = PlaySoundA(
            windows::core::PCSTR(data_ptr.as_ptr()),
            HMODULE::default(),
            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn play_wav_static(_data: &'static [u8]) {
    // TODO: implement for other platforms
    eprintln!("Sound playback not implemented on this platform");
}

#[cfg(not(target_os = "windows"))]
fn play_wav_dynamic(_data: Vec<u8>) {
    // TODO: implement for other platforms
    eprintln!("Sound playback not implemented on this platform");
}

/// Play the mute sound (tries external file first, falls back to embedded)
pub fn play_mute_sound() {
    if let Some(external_sound) = load_external_sound("mute.wav") {
        play_wav_dynamic(external_sound);
    } else {
        play_wav_static(MUTE_WAV);
    }
}

/// Play the unmute sound (tries external file first, falls back to embedded)
pub fn play_unmute_sound() {
    if let Some(external_sound) = load_external_sound("unmute.wav") {
        play_wav_dynamic(external_sound);
    } else {
        play_wav_static(UNMUTE_WAV);
    }
}
