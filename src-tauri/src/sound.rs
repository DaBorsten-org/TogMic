/// Embedded WAV files
const MUTE_WAV: &[u8] = include_bytes!("../resources/mute.wav");
const UNMUTE_WAV: &[u8] = include_bytes!("../resources/unmute.wav");

/// Initialize the sound system (no-op now, kept for API compatibility)
pub fn init() {}

/// Play a WAV buffer using the native Windows PlaySound API (async, no resampling)
#[cfg(target_os = "windows")]
fn play_wav(data: &'static [u8]) {
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

#[cfg(not(target_os = "windows"))]
fn play_wav(_data: &'static [u8]) {
    // TODO: implement for other platforms
    eprintln!("Sound playback not implemented on this platform");
}

/// Play the mute sound
pub fn play_mute_sound() {
    play_wav(MUTE_WAV);
}

/// Play the unmute sound
pub fn play_unmute_sound() {
    play_wav(UNMUTE_WAV);
}
