use std::fs;
use std::io::Cursor;
use std::sync::mpsc;
use once_cell::sync::OnceCell;

/// Embedded WAV files
const MUTE_WAV: &[u8] = include_bytes!("../resources/mute.wav");
const UNMUTE_WAV: &[u8] = include_bytes!("../resources/unmute.wav");

static SOUND_TX: OnceCell<mpsc::SyncSender<Vec<u8>>> = OnceCell::new();

/// Initialize the persistent audio thread (call once at startup)
pub fn init() {
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(1);
    if SOUND_TX.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let Ok((_stream, handle)) = rodio::OutputStream::try_default() else {
            return;
        };
        let mut current_sink: Option<rodio::Sink> = None;

        while let Ok(data) = rx.recv() {
            // Stop the currently playing sound before starting the new one
            if let Some(sink) = current_sink.take() {
                sink.stop();
            }
            if let Ok(sink) = rodio::Sink::try_new(&handle) {
                let cursor = Cursor::new(data);
                if let Ok(source) = rodio::Decoder::new(cursor) {
                    sink.append(source);
                    current_sink = Some(sink); // kept alive so rodio keeps playing
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
