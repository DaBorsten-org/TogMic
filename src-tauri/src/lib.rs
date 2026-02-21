mod audio;
mod sound;

use audio::{AudioController, AudioDevice, PlatformAudioController};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
// note: mpsc/debounce not used yet
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State, menu::{MenuBuilder, MenuItemBuilder}, path::BaseDirectory};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use std::str::FromStr;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::image::Image as TauriImage;
use once_cell::sync::Lazy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyProfile {
    pub id: String,
    pub name: String,
    pub toggle_key: String,
    pub device_ids: Vec<String>,
    #[serde(default)]
    pub ignore_modifiers: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub start_muted: bool,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_check_updates")]
    pub check_updates: bool,
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default)]
    pub start_minimized: bool,
}

fn default_check_updates() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            start_muted: true,
            autostart: true,
            check_updates: true,
            close_to_tray: true,
            start_minimized: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub profiles: Vec<HotkeyProfile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub app_settings: AppSettings,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            profiles: Vec::new(),
            active_profile_id: None,
            app_settings: AppSettings::default(),
        }
    }
}

pub struct AppState {
    pub current_profile: Arc<Mutex<Option<HotkeyProfile>>>,
    pub is_muted: Arc<AtomicBool>,
    pub devices: Arc<Mutex<Vec<AudioDevice>>>,
    pub audio_controller: Arc<Mutex<Option<PlatformAudioController>>>,
    pub close_to_tray: Arc<Mutex<bool>>,
    // Cache last visible tray state to avoid redundant tray API calls
    pub last_tray_muted: Arc<Mutex<Option<bool>>>,
    // Localized tray tooltip strings
    pub tray_tooltip_muted: Arc<Mutex<String>>,
    pub tray_tooltip_unmuted: Arc<Mutex<String>>,
    // Localized tray menu label strings
    pub tray_label_mute: Arc<Mutex<String>>,
    pub tray_label_unmute: Arc<Mutex<String>>,
    pub tray_label_show: Arc<Mutex<String>>,
    pub tray_label_quit: Arc<Mutex<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_profile: Arc::new(Mutex::new(None)),
            is_muted: Arc::new(AtomicBool::new(false)),
            devices: Arc::new(Mutex::new(Vec::new())),
            audio_controller: Arc::new(Mutex::new(None)),
            close_to_tray: Arc::new(Mutex::new(true)),
            last_tray_muted: Arc::new(Mutex::new(None)),
            tray_tooltip_muted: Arc::new(Mutex::new("TogMic - Muted".to_string())),
            tray_tooltip_unmuted: Arc::new(Mutex::new("TogMic - Unmuted".to_string())),
            tray_label_mute: Arc::new(Mutex::new("Mute".to_string())),
            tray_label_unmute: Arc::new(Mutex::new("Unmute".to_string())),
            tray_label_show: Arc::new(Mutex::new("Show Window".to_string())),
            tray_label_quit: Arc::new(Mutex::new("Quit".to_string())),
        }
    }
}

const ALL_DEVICES_ID: &str = "all-mics";

const TRAY_MUTED_BYTES: &[u8] = include_bytes!("../icons/tray-muted.png");
const TRAY_UNMUTED_BYTES: &[u8] = include_bytes!("../icons/tray-unmuted.png");

// Lazy cached TauriImage instances created from embedded bytes to avoid repeated IO/decoding
static LAZY_TRAY_MUTED: Lazy<TauriImage<'static>> = Lazy::new(|| {
    TauriImage::from_bytes(TRAY_MUTED_BYTES).expect("failed to create muted tray image")
});

static LAZY_TRAY_UNMUTED: Lazy<TauriImage<'static>> = Lazy::new(|| {
    TauriImage::from_bytes(TRAY_UNMUTED_BYTES).expect("failed to create unmuted tray image")
});

fn profile_uses_all_devices(profile: &HotkeyProfile) -> bool {
    profile.device_ids.len() > 1 || profile.device_ids.iter().any(|id| id == ALL_DEVICES_ID)
}

fn resolve_device_ids(
    controller: &PlatformAudioController,
    profile: &HotkeyProfile,
) -> Result<Vec<String>, String> {
    if profile_uses_all_devices(profile) {
        let devices = controller.enumerate_input_devices()?;
        Ok(devices.into_iter().map(|device| device.id).collect())
    } else {
        Ok(profile.device_ids.clone())
    }
}

fn get_profile_mute_state(
    controller: &PlatformAudioController,
    profile: &HotkeyProfile,
    fallback: bool,
) -> Result<bool, String> {
    if profile_uses_all_devices(profile) {
        let devices = controller.enumerate_input_devices()?;
        if devices.is_empty() {
            return Ok(fallback);
        }

        for device in devices {
            let muted = controller.get_mute_state(&device.id).unwrap_or(fallback);
            if !muted {
                return Ok(false);
            }
        }

        Ok(true)
    } else if let Some(first_device) = profile.device_ids.first() {
        Ok(controller.get_mute_state(first_device).unwrap_or(fallback))
    } else {
        Ok(fallback)
    }
}
fn apply_mute_async(device_ids: Vec<String>, muted: bool) {
    std::thread::spawn(move || {
        // Initialize audio subsystem for this thread (e.g., COM on Windows)
        let _ = PlatformAudioController::init_thread();

        if let Ok(controller) = PlatformAudioController::new() {
            for device_id in device_ids {
                let _ = controller.set_mute_state(&device_id, muted);
            }
        }
    });
}

// Tauri Commands

#[tauri::command]
fn get_audio_devices(state: State<AppState>) -> Result<Vec<AudioDevice>, String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    
    if let Some(controller) = controller_lock.as_ref() {
        let devices = controller.enumerate_input_devices()?;
        
        // Update cached devices
        let mut devices_lock = state.devices.lock().unwrap();
        *devices_lock = devices.clone();
        
        Ok(devices)
    } else {
        Err("Audio controller not initialized".to_string())
    }
}

#[tauri::command]
fn toggle_mute(state: State<AppState>, app: AppHandle) -> Result<bool, String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        // Fast path: toggle based on cached state so UI/tray update is immediate
        let cached = state.is_muted.load(Ordering::SeqCst);
        let new_state = !cached;

        // Resolve device ids now and apply the change asynchronously so we don't block
        let device_ids = resolve_device_ids(controller, profile)?;

        state.is_muted.store(new_state, Ordering::SeqCst);

        // Play sound feedback immediately
        if new_state {
            sound::play_mute_sound();
        } else {
            sound::play_unmute_sound();
        }

        // Emit event to frontend
        let _ = app.emit("mute-state-changed", new_state);

        // Update tray icon immediately
        update_tray_icon(&app, new_state);

        // Apply system mute changes in background
        apply_mute_async(device_ids, new_state);

        Ok(new_state)
    } else {
        Err("No active profile or audio controller not initialized".to_string())
    }
}

#[tauri::command]
fn set_mute(muted: bool, silent: Option<bool>, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        let device_ids = resolve_device_ids(controller, profile)?;
        // Apply mute state to all devices in profile
        for device_id in device_ids {
            controller.set_mute_state(&device_id, muted)?;
        }
        
        state.is_muted.store(muted, Ordering::SeqCst);
        
        // Play sound feedback only if not silent
        if !silent.unwrap_or(false) {
            if muted {
                sound::play_mute_sound();
            } else {
                sound::play_unmute_sound();
            }
        }
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", muted);
        
        // Update tray icon
        update_tray_icon(&app, muted);
        
        Ok(())
    } else {
        Err("No active profile or audio controller not initialized".to_string())
    }
}

#[tauri::command]
fn get_mute_state(state: State<AppState>) -> Result<bool, String> {
    // Read actual mute state from the system instead of using cached value
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        let cached = state.is_muted.load(Ordering::SeqCst);
        if let Ok(system_muted) = get_profile_mute_state(controller, profile, cached) {
            state.is_muted.store(system_muted, Ordering::SeqCst);
            return Ok(system_muted);
        }
    }
    
    Ok(state.is_muted.load(Ordering::SeqCst))
}

#[tauri::command]
fn save_profile(profile: HotkeyProfile) -> Result<(), String> {
    // Validate the profile
    if profile.name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }
    
    if profile.toggle_key.is_empty() {
        return Err("Hotkey cannot be empty".to_string());
    }
    
    if profile.device_ids.is_empty() {
        return Err("At least one device must be selected".to_string());
    }
    
    // Note: Actual saving to config will be done from frontend using save_config command
    // This command just validates the profile
    Ok(())
}

#[tauri::command]
fn set_active_profile(profile: HotkeyProfile, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    // Set the new active profile
    {
        let mut profile_lock = state.current_profile.lock().unwrap();
        *profile_lock = Some(profile.clone());
    }

    // Immediately sync mute state and tray icon for the newly selected profile
    let controller_lock = state.audio_controller.lock().unwrap();
    if let Some(controller) = controller_lock.as_ref() {
        let cached = state.is_muted.load(Ordering::SeqCst);
        if let Ok(system_muted) = get_profile_mute_state(controller, &profile, cached) {
            state.is_muted.store(system_muted, Ordering::SeqCst);
            let _ = app.emit("mute-state-changed", system_muted);
            update_tray_icon(&app, system_muted);
        }
    }

    Ok(())
}

#[tauri::command]
fn get_active_profile(state: State<AppState>) -> Result<Option<HotkeyProfile>, String> {
    let profile_lock = state.current_profile.lock().unwrap();
    Ok(profile_lock.clone())
}

#[tauri::command]
fn register_hotkey(hotkey: String, ignore_modifiers: Option<bool>, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    // Unregister all existing shortcuts first
    let _ = app.global_shortcut().unregister_all();

    // Build list of shortcut strings to register
    let hotkeys_to_register: Vec<String> = if ignore_modifiers.unwrap_or(false) {
        // Register all modifier combinations so the hotkey fires regardless of held modifiers
        let prefixes = [
            "",
            "CommandOrControl+",
            "Alt+",
            "Shift+",
            "CommandOrControl+Alt+",
            "CommandOrControl+Shift+",
            "Alt+Shift+",
            "CommandOrControl+Alt+Shift+",
        ];
        prefixes.iter().map(|p| format!("{}{}", p, hotkey)).collect()
    } else {
        vec![hotkey.clone()]
    };

    let audio_controller = state.audio_controller.clone();
    let current_profile = state.current_profile.clone();
    let is_muted = state.is_muted.clone();

    for hotkey_str in hotkeys_to_register {
        let shortcut = match Shortcut::from_str(&hotkey_str) {
            Ok(s) => s,
            // Skip combinations that the OS doesn't allow (e.g. reserved system shortcuts)
            Err(_) => continue,
        };

        // If unregister_all() silently failed and the shortcut is still registered,
        // keep the existing handler instead of returning a duplicate-registration error.
        if app.global_shortcut().is_registered(shortcut) {
            continue;
        }

        let audio_controller = audio_controller.clone();
        let current_profile = current_profile.clone();
        let is_muted = is_muted.clone();

        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                // Only toggle on key press, not on key release
                use tauri_plugin_global_shortcut::ShortcutState;
                if event.state != ShortcutState::Pressed {
                    return;
                }

                let controller_lock = audio_controller.lock().unwrap();
                let profile_lock = current_profile.lock().unwrap();

                if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
                    // Fast path: toggle based on cached state and apply changes asynchronously
                    let old = is_muted.load(Ordering::SeqCst);
                    let new_state = !old;

                    let device_ids = resolve_device_ids(controller, profile).unwrap_or_else(|_| profile.device_ids.clone());

                    is_muted.store(new_state, Ordering::SeqCst);

                    // Play sound feedback immediately
                    if new_state {
                        sound::play_mute_sound();
                    } else {
                        sound::play_unmute_sound();
                    }

                    // Emit event to frontend and update tray icon
                    let _ = app.emit("mute-state-changed", new_state);
                    update_tray_icon(app, new_state);

                    // Apply system mute in background
                    apply_mute_async(device_ids, new_state);
                }
            })
            .map_err(|e| format!("Failed to register hotkey '{}': {}", hotkey_str, e))?;
    }

    Ok(())
}

#[tauri::command]
fn unregister_hotkey(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut profile_lock = state.current_profile.lock().unwrap();
    *profile_lock = None;
    drop(profile_lock);
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {}", e))
}

#[tauri::command]
async fn set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    let autostart_manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();
    
    if enabled {
        autostart_manager
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        autostart_manager
            .disable()
            .map_err(|e| format!("Failed to disable autostart: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn get_autostart_status(app: AppHandle) -> Result<bool, String> {
    let autostart_manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();
    autostart_manager
        .is_enabled()
        .map_err(|e| format!("Failed to get autostart status: {}", e))
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, state: State<AppState>) -> Result<(), String> {
    let mut close_to_tray = state.close_to_tray.lock().unwrap();
    *close_to_tray = enabled;
    Ok(())
}

#[tauri::command]
fn update_tray_labels(
    mute: String,
    unmute: String,
    show: String,
    quit: String,
    muted_tooltip: String,
    unmuted_tooltip: String,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
    *state.tray_label_mute.lock().unwrap() = mute;
    *state.tray_label_unmute.lock().unwrap() = unmute;
    *state.tray_label_show.lock().unwrap() = show;
    *state.tray_label_quit.lock().unwrap() = quit;
    *state.tray_tooltip_muted.lock().unwrap() = muted_tooltip.clone();
    *state.tray_tooltip_unmuted.lock().unwrap() = unmuted_tooltip.clone();

    let is_muted = state.is_muted.load(Ordering::SeqCst);
    rebuild_tray_menu(&app, is_muted);

    if let Some(tray) = app.tray_by_id("main-tray") {
        let tooltip = if is_muted { &muted_tooltip } else { &unmuted_tooltip };
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }

    Ok(())
}

// Config file handling

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    // Prefer the per-user AppConfig directory so the config survives dev rebuilds
    let config_dir = app.path()
        .resolve(".", BaseDirectory::AppConfig)
        .map_err(|e| format!("Failed to resolve config directory: {}", e))?;

    // Ensure the config directory exists
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(config_dir.join("config.json"))
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<Config, String> {
    let config_path = get_config_path(&app)?;
    
    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        
        let config: Config = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;
        
        Ok(config)
    } else {
        // Return default config if file doesn't exist
        Ok(Config::default())
    }
}

#[tauri::command]
fn save_config(config: Config, app: AppHandle) -> Result<(), String> {
    let config_path = get_config_path(&app)?;
    
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

fn load_tray_image(app: &AppHandle, file_name: &str, fallback: &'static [u8]) -> TauriImage<'static> {
    // Fast-path for bundled icons: return pre-decoded cached images to avoid path resolution and decoding overhead
    if file_name.ends_with("tray-muted.png") {
        return LAZY_TRAY_MUTED.clone();
    }

    if file_name.ends_with("tray-unmuted.png") {
        return LAZY_TRAY_UNMUTED.clone();
    }

    // Fallback: try loading from resource path, otherwise decode bytes
    let resolved = app
        .path()
        .resolve(format!("icons/{}", file_name), BaseDirectory::Resource);
    if let Ok(path) = resolved {
        if let Ok(icon) = TauriImage::from_path(path) {
            return icon;
        }
    }

    TauriImage::from_bytes(fallback).expect("fallback tray icon")
}

fn rebuild_tray_menu(app: &AppHandle, is_muted: bool) {
    let state = app.state::<AppState>();
    let toggle_label = if is_muted {
        state.tray_label_unmute.lock().unwrap().clone()
    } else {
        state.tray_label_mute.lock().unwrap().clone()
    };
    let show_label = state.tray_label_show.lock().unwrap().clone();
    let quit_label = state.tray_label_quit.lock().unwrap().clone();

    if let Some(tray) = app.tray_by_id("main-tray") {
        if let (Ok(toggle_item), Ok(show_item), Ok(quit_item)) = (
            MenuItemBuilder::with_id("toggle", &toggle_label).build(app),
            MenuItemBuilder::with_id("show", &show_label).build(app),
            MenuItemBuilder::with_id("quit", &quit_label).build(app),
        ) {
            if let Ok(menu) = MenuBuilder::new(app)
                .item(&toggle_item)
                .separator()
                .item(&show_item)
                .item(&quit_item)
                .build()
            {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}

// Helper function to update the tray icon based on mute state
fn update_tray_icon(app: &AppHandle, is_muted: bool) {
    // Avoid redundant tray updates by comparing with cached visible state
    let state = app.state::<AppState>();
    let mut last_lock = state.last_tray_muted.lock().unwrap();
    if let Some(prev) = *last_lock {
        if prev == is_muted {
            return; // nothing to update
        }
    }

    if let Some(tray) = app.tray_by_id("main-tray") {
        let icon = if is_muted {
            load_tray_image(app, "tray-muted.png", TRAY_MUTED_BYTES)
        } else {
            load_tray_image(app, "tray-unmuted.png", TRAY_UNMUTED_BYTES)
        };
        let _ = tray.set_icon(Some(icon));
        let tooltip = if is_muted {
            state.tray_tooltip_muted.lock().unwrap().clone()
        } else {
            state.tray_tooltip_unmuted.lock().unwrap().clone()
        };
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }

    *last_lock = Some(is_muted);
    drop(last_lock);

    rebuild_tray_menu(app, is_muted);
}

// Helper function for hotkey callback
fn toggle_mute_internal(state: &AppState, app: &AppHandle) -> Result<bool, String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        // Read actual mute state from system to stay in sync
        let cached = state.is_muted.load(Ordering::SeqCst);
        let actual_muted = get_profile_mute_state(controller, profile, cached)?;
        let new_state = !actual_muted;

        let device_ids = resolve_device_ids(controller, profile)?;
        // Apply mute state to all devices in profile
        for device_id in device_ids {
            let _ = controller.set_mute_state(&device_id, new_state);
        }
        
        state.is_muted.store(new_state, Ordering::SeqCst);
        
        // Play sound feedback
        if new_state {
            sound::play_mute_sound();
        } else {
            sound::play_unmute_sound();
        }
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", new_state);
        
        // Update tray icon
        update_tray_icon(app, new_state);
        
        Ok(new_state)
    } else {
        Err("No active profile or audio controller not initialized".to_string())
    }
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_item = MenuItemBuilder::with_id("toggle", "Toggle Mute").build(app)?;
    let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    
    let menu = MenuBuilder::new(app)
        .item(&toggle_item)
        .separator()
        .item(&show_item)
        .item(&quit_item)
        .build()?;
    
    let initial_icon = load_tray_image(app, "tray-unmuted.png", TRAY_UNMUTED_BYTES);
    
    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(initial_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("TogMic - Unmuted")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "toggle" => {
                    let state = app.state::<AppState>();
                    let _ = toggle_mute_internal(&state, app);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<AppState>();
                let _ = toggle_mute_internal(&state, app);
            }
        })
        .build(app)?;
    
    // Ensure tray icon reflects the current mute state at startup
    let state = app.state::<AppState>();
    let current = state.is_muted.load(Ordering::SeqCst);
    update_tray_icon(app, current);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize audio controller
    let audio_controller = match PlatformAudioController::new() {
        Ok(controller) => Some(controller),
        Err(e) => {
            eprintln!("Warning: Failed to initialize audio controller: {}", e);
            None
        }
    };
    
    let app_state = AppState {
        audio_controller: Arc::new(Mutex::new(audio_controller)),
        ..Default::default()
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_audio_devices,
            toggle_mute,
            set_mute,
            get_mute_state,
            save_profile,
            set_active_profile,
            get_active_profile,
            register_hotkey,
            unregister_hotkey,
            set_autostart,
            get_autostart_status,
            set_close_to_tray,
            update_tray_labels,
            load_config,
            save_config,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let close_to_tray = state.close_to_tray.lock().unwrap();
                if *close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            setup_tray(app.handle())?;
            
            // Initialize persistent audio playback thread
            sound::init();
            
            // Try to load saved config and set active profile on startup so tray matches
            if let Ok(cfg) = load_config(app.handle().clone()) {
                if let Some(active_id) = cfg.active_profile_id.clone() {
                    if let Some(profile) = cfg.profiles.iter().find(|p| p.id == active_id).cloned() {
                        // Set active profile and sync state/tray
                        {
                            let state = app.state::<AppState>();
                            let mut profile_lock = state.current_profile.lock().unwrap();
                            *profile_lock = Some(profile.clone());
                            let controller_lock = state.audio_controller.lock().unwrap();
                            if let Some(controller) = controller_lock.as_ref() {
                                let cached = state.is_muted.load(Ordering::SeqCst);
                                if let Ok(system_muted) = get_profile_mute_state(controller, &profile, cached) {
                                    state.is_muted.store(system_muted, Ordering::SeqCst);
                                    let _ = app.handle().emit("mute-state-changed", system_muted);
                                    update_tray_icon(&app.handle(), system_muted);
                                }
                            }
                        }
                    }
                }
                // tauri.conf.json now creates the main window hidden by default to avoid a flash.
                // Show the window only if the user did NOT enable start_minimized.
                if !cfg.app_settings.start_minimized {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            
            // Start background polling thread to sync mute state with system
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // Initialize audio subsystem for this thread (e.g., COM on Windows)
                let _ = PlatformAudioController::init_thread();
                
                let poll_controller = match PlatformAudioController::new() {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("Failed to create polling audio controller: {}", e);
                        return;
                    }
                };
                
                let mut prev_device_ids: Option<Vec<String>> = None;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    
                    let state = app_handle.state::<AppState>();
                    
                    let profile = {
                        let profile_lock = state.current_profile.lock().unwrap();
                        profile_lock.as_ref().cloned()
                    };

                    if let Some(profile) = profile {
                        // Device list change detection: enumerate devices and compare ids
                        if let Ok(devs) = poll_controller.enumerate_input_devices() {
                            let ids: Vec<String> = devs.iter().map(|d| d.id.clone()).collect();
                            if prev_device_ids.as_ref() != Some(&ids) {
                                prev_device_ids = Some(ids.clone());
                                // Invalidate cached endpoints when devices change
                                #[cfg(target_os = "windows")]
                                audio::clear_endpoint_cache();
                                // Emit devices changed event
                                let _ = app_handle.emit("devices-changed", ids);
                            }
                        }

                        let cached = state.is_muted.load(Ordering::SeqCst);

                        if let Ok(system_muted) = get_profile_mute_state(&poll_controller, &profile, cached) {
                            let prev = state.is_muted.load(Ordering::SeqCst);
                            if prev != system_muted {
                                state.is_muted.store(system_muted, Ordering::SeqCst);

                                // Emit event to frontend
                                let _ = app_handle.emit("mute-state-changed", system_muted);

                                // Update tray icon
                                update_tray_icon(&app_handle, system_muted);
                            }
                        }
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
