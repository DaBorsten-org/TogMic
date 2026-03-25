use std::fs;
use std::io::Cursor;
use std::sync::mpsc;
use once_cell::sync::OnceCell;
use rodio::cpal::traits::{DeviceTrait, HostTrait};

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
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(1);
    if SOUND_TX.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || {
        // (stream, handle, device_name_when_opened)
        type StreamState = (rodio::OutputStream, rodio::OutputStreamHandle, String);
        let mut stream_state: Option<StreamState> = None;
        let mut current_sink: Option<rodio::Sink> = None;

        while let Ok(data) = rx.recv() {
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

            // Create a new sink per sound (stream stays open = no crackling)
            // Old sink is dropped here; only causes a click if previous sound was still playing
            drop(current_sink.take());
            if let Ok(sink) = rodio::Sink::try_new(handle) {
                if let Ok(source) = rodio::Decoder::new(Cursor::new(data)) {
                    sink.append(source);
                    current_sink = Some(sink);
                }
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
