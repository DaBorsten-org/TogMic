use std::fs;
use std::io::Cursor;
use std::sync::mpsc;
use std::time::Duration;
use once_cell::sync::OnceCell;
use rodio::cpal::traits::{DeviceTrait, HostTrait};

// Release audio stream after this many seconds of silence so Bluetooth devices
// can go idle and other audio sources (e.g. phone music) can take over.
const STREAM_IDLE_TIMEOUT_SECS: u64 = 5;

/// Embedded WAV files
const MUTE_WAV: &[u8] = include_bytes!("../resources/mute.wav");
const UNMUTE_WAV: &[u8] = include_bytes!("../resources/unmute.wav");

static SOUND_TX: OnceCell<mpsc::SyncSender<Vec<u8>>> = OnceCell::new();

fn default_device_name() -> Option<String> {
    rodio::cpal::default_host()
        .default_output_device()
        .and_then(|d| d.name().ok())
}

/// Initialize the persistent audio thread (call once at startup)
pub fn init() {
    // Buffer up to 8 sounds so rapid toggles don't silently drop messages;
    // the debounce loop below drains this queue and plays only the latest.
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(8);
    if SOUND_TX.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || {
        // (stream, handle, device_name_when_opened)
        type StreamState = (rodio::OutputStream, rodio::OutputStreamHandle, String);
        let mut stream_state: Option<StreamState> = None;
        let mut current_sink: Option<rodio::Sink> = None;

        loop {
            match rx.recv_timeout(Duration::from_secs(STREAM_IDLE_TIMEOUT_SECS)) {
                Ok(mut data) => {
                    // Debounce rapid toggles: drain any sounds queued within the
                    // next 40 ms and keep only the latest. This prevents overlap
                    // when the user mutes/unmutes faster than the sound duration.
                    loop {
                        match rx.recv_timeout(Duration::from_millis(40)) {
                            Ok(newer) => data = newer,
                            Err(mpsc::RecvTimeoutError::Timeout) => break,
                            Err(mpsc::RecvTimeoutError::Disconnected) => return,
                        }
                    }

                    let current_device = default_device_name().unwrap_or_default();

                    // Reinitialize stream only if device changed or not yet initialized
                    let needs_reinit = stream_state.as_ref()
                        .map(|(_, _, name)| name != &current_device)
                        .unwrap_or(true);

                    if needs_reinit {
                        drop(current_sink.take());
                        drop(stream_state.take());
                        if let Ok((stream, handle)) = rodio::OutputStream::try_default() {
                            stream_state = Some((stream, handle, current_device));
                        }
                    }

                    let Some((_, ref handle, _)) = stream_state else { continue };

                    // Create a new sink per sound — old sink dropped to stop previous sound
                    drop(current_sink.take());
                    if let Ok(sink) = rodio::Sink::try_new(handle) {
                        if let Ok(source) = rodio::Decoder::new(Cursor::new(data)) {
                            sink.append(source);
                            current_sink = Some(sink);
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // No sound played for STREAM_IDLE_TIMEOUT_SECS seconds.
                    // Release the audio stream so Bluetooth devices can go idle
                    // and other audio sources (e.g. phone) can take over.
                    if current_sink.as_ref().map_or(true, |s| s.empty()) {
                        drop(current_sink.take());
                        drop(stream_state.take());
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

/// Try to load an external sound file from the executable directory
fn load_external_sound(filename: &str) -> Option<Vec<u8>> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    let sound_path = exe_dir.join(filename);
    fs::read(sound_path).ok()
}

fn play_wav(data: Vec<u8>) {
    if let Some(tx) = SOUND_TX.get() {
        // Discard old queued sound if the channel is full — newest wins
        let _ = tx.try_send(data);
    }
}

/// Play the mute sound (tries external file first, falls back to embedded)
pub fn play_mute_sound() {
    let data = load_external_sound("mute.wav")
        .unwrap_or_else(|| MUTE_WAV.to_vec());
    play_wav(data);
}

/// Play the unmute sound (tries external file first, falls back to embedded)
pub fn play_unmute_sound() {
    let data = load_external_sound("unmute.wav")
        .unwrap_or_else(|| UNMUTE_WAV.to_vec());
    play_wav(data);
}
