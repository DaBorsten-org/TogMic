use rodio::{OutputStream, Sink, Source};
use std::time::Duration;

/// Play a beep sound with the specified frequency
fn play_beep(frequency: f32, duration_ms: u64) {
    std::thread::spawn(move || {
        if let Ok((_stream, stream_handle)) = OutputStream::try_default() {
            if let Ok(sink) = Sink::try_new(&stream_handle) {
                let source = rodio::source::SineWave::new(frequency)
                    .take_duration(Duration::from_millis(duration_ms))
                    .amplify(0.20); // 20% volume to not be too loud
                
                sink.append(source);
                sink.sleep_until_end();
            }
        }
    });
}

/// Play a lower tone (300 Hz) when muting
pub fn play_mute_sound() {
    play_beep(300.0, 100);
}

/// Play a higher tone (600 Hz) when unmuting
pub fn play_unmute_sound() {
    play_beep(600.0, 100);
}
