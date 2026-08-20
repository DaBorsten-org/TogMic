use super::{AudioController, AudioDevice};

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use libpulse_binding::context::subscribe::{Facility, InterestMaskSet, Operation as EventOp};
use libpulse_binding::context::{Context, FlagSet as ContextFlagSet, State as ContextState};
use libpulse_binding::callbacks::ListResult;
use libpulse_binding::mainloop::standard::{IterateResult, Mainloop};
use libpulse_binding::operation::State as OperationState;
use libpulse_binding::proplist::{properties, Proplist};

/// Device id the rest of the app uses for "whatever the system default source is".
const DEFAULT_DEVICE_ID: &str = "default-mic";

/// How long we wait for the daemon to answer before giving up. Every call runs on a
/// background thread (worker or poller), but a hung socket must never wedge them.
const TIMEOUT: Duration = Duration::from_secs(2);

/// Sleep between non-blocking mainloop iterations so waiting does not spin a core.
const ITERATE_SLEEP: Duration = Duration::from_millis(2);

/// How long the event listener waits before rebuilding a subscription that died with the
/// daemon (pipewire-pulse restart, session teardown).
const RESUBSCRIBE_DELAY: Duration = Duration::from_secs(2);

/// A live connection to the PulseAudio (or pipewire-pulse) daemon.
///
/// Neither `Mainloop` nor `Context` is `Send`, and `AppState` requires the controller to
/// be — so the connection lives in a thread-local instead of in the controller struct.
/// Each thread that touches audio (command handler, audio worker, 500ms poller) keeps its
/// own connection warm; a dropped daemon connection is detected and re-established on the
/// next call.
struct PulseConn {
    mainloop: Mainloop,
    context: Context,
}

impl PulseConn {
    fn connect() -> Result<Self, String> {
        let mut proplist = Proplist::new().ok_or("failed to create PulseAudio proplist")?;
        let _ = proplist.set_str(properties::APPLICATION_NAME, "TogMic");

        let mut mainloop = Mainloop::new().ok_or("failed to create PulseAudio mainloop")?;
        let mut context = Context::new_with_proplist(&mainloop, "TogMic", &proplist)
            .ok_or("failed to create PulseAudio context")?;

        context
            .connect(None, ContextFlagSet::NOFLAGS, None)
            .map_err(|e| format!("failed to connect to PulseAudio: {}", e))?;

        let deadline = Instant::now() + TIMEOUT;
        loop {
            iterate(&mut mainloop)?;

            match context.get_state() {
                ContextState::Ready => break,
                ContextState::Failed | ContextState::Terminated => {
                    return Err("PulseAudio connection failed".to_string())
                }
                _ => {}
            }

            if Instant::now() >= deadline {
                return Err("timed out connecting to PulseAudio".to_string());
            }
            std::thread::sleep(ITERATE_SLEEP);
        }

        Ok(PulseConn { mainloop, context })
    }

    fn is_alive(&self) -> bool {
        self.context.get_state() == ContextState::Ready
    }

    /// Drive the mainloop until `op` finishes, then hand back the collected result.
    fn wait<T: ?Sized, R>(
        &mut self,
        op: libpulse_binding::operation::Operation<T>,
        result: Rc<RefCell<R>>,
    ) -> Result<R, String>
    where
        R: Default,
    {
        let deadline = Instant::now() + TIMEOUT;
        loop {
            iterate(&mut self.mainloop)?;

            match op.get_state() {
                OperationState::Done => break,
                OperationState::Cancelled => {
                    return Err("PulseAudio request was cancelled".to_string())
                }
                OperationState::Running => {}
            }

            if !self.is_alive() {
                return Err("lost connection to PulseAudio".to_string());
            }
            if Instant::now() >= deadline {
                return Err("timed out waiting for PulseAudio".to_string());
            }
            std::thread::sleep(ITERATE_SLEEP);
        }

        Ok(std::mem::take(&mut *result.borrow_mut()))
    }

    fn default_source_name(&mut self) -> Result<String, String> {
        let name: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
        let slot = name.clone();

        let op = self.context.introspect().get_server_info(move |info| {
            *slot.borrow_mut() = info.default_source_name.as_ref().map(|n| n.to_string());
        });

        self.wait(op, name)?
            .ok_or_else(|| "no default input device".to_string())
    }

    /// Maps the app-level device id onto a PulseAudio source name.
    fn resolve(&mut self, device_id: &str) -> Result<String, String> {
        if device_id.is_empty() || device_id == DEFAULT_DEVICE_ID {
            self.default_source_name()
        } else {
            Ok(device_id.to_string())
        }
    }

    fn sources(&mut self) -> Result<Vec<AudioDevice>, String> {
        let default_name = self.default_source_name().unwrap_or_default();

        let devices: Rc<RefCell<Vec<AudioDevice>>> = Rc::new(RefCell::new(Vec::new()));
        let slot = devices.clone();

        let op = self
            .context
            .introspect()
            .get_source_info_list(move |result| {
                let ListResult::Item(info) = result else {
                    return;
                };

                // Every sink has a matching monitor source (loopback of what is playing).
                // Those are not microphones, so they never belong in the device list.
                if info.monitor_of_sink.is_some() {
                    return;
                }

                let Some(name) = info.name.as_ref().map(|n| n.to_string()) else {
                    return;
                };
                let description = info
                    .description
                    .as_ref()
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| name.clone());

                slot.borrow_mut().push(AudioDevice {
                    is_default: false,
                    id: name,
                    name: description,
                });
            });

        let mut devices = self.wait(op, devices)?;
        for device in &mut devices {
            device.is_default = device.id == default_name;
        }
        Ok(devices)
    }

    fn mute_state(&mut self, device_id: &str) -> Result<bool, String> {
        let source = self.resolve(device_id)?;

        let muted: Rc<RefCell<Option<bool>>> = Rc::new(RefCell::new(None));
        let slot = muted.clone();

        let op = self
            .context
            .introspect()
            .get_source_info_by_name(&source, move |result| {
                if let ListResult::Item(info) = result {
                    *slot.borrow_mut() = Some(info.mute);
                }
            });

        self.wait(op, muted)?
            .ok_or_else(|| format!("input device not found: {}", source))
    }

    fn set_mute(&mut self, device_id: &str, muted: bool) -> Result<(), String> {
        let source = self.resolve(device_id)?;

        let success: Rc<RefCell<bool>> = Rc::new(RefCell::new(false));
        let slot = success.clone();

        let op = self.context.introspect().set_source_mute_by_name(
            &source,
            muted,
            Some(Box::new(move |ok| *slot.borrow_mut() = ok)),
        );

        if self.wait(op, success)? {
            Ok(())
        } else {
            Err(format!("failed to set mute state for {}", source))
        }
    }
}

impl Drop for PulseConn {
    fn drop(&mut self) {
        self.context.disconnect();
    }
}

fn iterate(mainloop: &mut Mainloop) -> Result<(), String> {
    match mainloop.iterate(false) {
        IterateResult::Success(_) => Ok(()),
        IterateResult::Quit(_) => Err("PulseAudio mainloop quit".to_string()),
        IterateResult::Err(e) => Err(format!("PulseAudio mainloop error: {}", e)),
    }
}

thread_local! {
    static CONNECTION: RefCell<Option<PulseConn>> = const { RefCell::new(None) };
}

/// Runs `f` against this thread's connection, reconnecting once if the cached one is
/// stale (daemon restarted, session bus replaced) or if the call fails on it.
fn with_conn<T>(f: impl Fn(&mut PulseConn) -> Result<T, String>) -> Result<T, String> {
    CONNECTION.with(|cell| {
        let mut slot = cell.borrow_mut();

        if let Some(conn) = slot.as_mut() {
            if conn.is_alive() {
                match f(conn) {
                    Ok(value) => return Ok(value),
                    // Fall through to a fresh connection: a failure here is as likely to
                    // be a half-dead socket as a genuinely bad request.
                    Err(_) => {}
                }
            }
            *slot = None;
        }

        let mut conn = PulseConn::connect()?;
        let result = f(&mut conn);
        if result.is_ok() {
            *slot = Some(conn);
        }
        result
    })
}

/// Watches the daemon for microphone changes instead of polling it.
///
/// PulseAudio pushes an event whenever a source's mute flag flips, a source appears or
/// disappears, or the default source is switched — everything the 500 ms poll loop the
/// other platforms fall back to was looking for. The thread blocks inside the mainloop
/// between events, so an idle TogMic costs nothing.
///
/// `on_mute_changed` fires when a source's state may have moved; `on_devices_changed`
/// only when the device list itself may have. Both run on the listener thread.
pub fn start_audio_listeners(
    on_mute_changed: Arc<dyn Fn() + Send + Sync>,
    on_devices_changed: Arc<dyn Fn() + Send + Sync>,
) {
    std::thread::spawn(move || loop {
        // Any error ends the subscription for good, so reconnect rather than going deaf
        // to every future change after a single daemon restart.
        if let Err(e) = run_subscription(&on_mute_changed, &on_devices_changed) {
            eprintln!("[pulse] subscription ended: {}", e);
        }
        std::thread::sleep(RESUBSCRIBE_DELAY);
    });
}

fn run_subscription(
    on_mute_changed: &Arc<dyn Fn() + Send + Sync>,
    on_devices_changed: &Arc<dyn Fn() + Send + Sync>,
) -> Result<(), String> {
    let mut conn = PulseConn::connect()?;

    // The callback fires from inside `iterate`, where issuing another request on the same
    // context is not safe. Record what happened and act once the iteration has returned.
    type EventQueue = Rc<RefCell<Vec<(Facility, Option<EventOp>)>>>;
    let events: EventQueue = Rc::new(RefCell::new(Vec::new()));
    let slot = events.clone();
    conn.context
        .set_subscribe_callback(Some(Box::new(move |facility, op, _index| {
            if let Some(facility) = facility {
                slot.borrow_mut().push((facility, op));
            }
        })));

    let op = conn
        .context
        .subscribe(InterestMaskSet::SOURCE | InterestMaskSet::SERVER, |_| {});
    conn.wait(op, Rc::new(RefCell::new(())))?;

    loop {
        // Blocking iteration: the thread sleeps in poll() until the daemon says something.
        match conn.mainloop.iterate(true) {
            IterateResult::Success(_) => {}
            IterateResult::Quit(_) => return Err("PulseAudio mainloop quit".to_string()),
            IterateResult::Err(e) => return Err(format!("PulseAudio mainloop error: {}", e)),
        }

        if !conn.is_alive() {
            return Err("lost connection to PulseAudio".to_string());
        }

        let batch = std::mem::take(&mut *events.borrow_mut());
        if batch.is_empty() {
            continue;
        }

        // A source coming or going changes the list; a server event means the default
        // source moved, which changes both the list's `is_default` flags and our state.
        // `Source` + `Changed` is the common case — a mute flag — and must not trigger a
        // device reload on every single toggle.
        let devices_changed = batch.iter().any(|(facility, op)| {
            matches!(facility, Facility::Server)
                || matches!(op, Some(EventOp::New) | Some(EventOp::Removed))
        });

        if devices_changed {
            on_devices_changed();
        }
        on_mute_changed();
    }
}

pub struct LinuxAudioController;

impl AudioController for LinuxAudioController {
    fn new() -> Result<Self, String> {
        Ok(LinuxAudioController)
    }

    fn enumerate_input_devices(&self) -> Result<Vec<AudioDevice>, String> {
        with_conn(|conn| conn.sources())
    }

    fn get_mute_state(&self, device_id: &str) -> Result<bool, String> {
        with_conn(|conn| conn.mute_state(device_id))
    }

    fn set_mute_state(&self, device_id: &str, muted: bool) -> Result<(), String> {
        with_conn(|conn| conn.set_mute(device_id, muted))
    }
}

