mod audio;
mod sound;

use audio::{AudioController, AudioDevice, PlatformAudioController};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, menu::{MenuBuilder, MenuItemBuilder}, path::BaseDirectory};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use std::str::FromStr;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::image::Image as TauriImage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyProfile {
    pub id: String,
    pub name: String,
    pub toggle_key: String,
    pub device_ids: Vec<String>,
}

#[derive(Default)]
pub struct AppState {
    pub current_profile: Arc<Mutex<Option<HotkeyProfile>>>,
    pub is_muted: Arc<Mutex<bool>>,
    pub devices: Arc<Mutex<Vec<AudioDevice>>>,
    pub audio_controller: Arc<Mutex<Option<PlatformAudioController>>>,
    pub close_to_tray: Arc<Mutex<bool>>,
}

const TRAY_MUTED_BYTES: &[u8] = include_bytes!("../icons/tray-muted.png");
const TRAY_UNMUTED_BYTES: &[u8] = include_bytes!("../icons/tray-unmuted.png");

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
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        // Read actual mute state from system to stay in sync
        let actual_muted = if let Some(first_device) = profile.device_ids.first() {
            controller.get_mute_state(first_device).unwrap_or(*is_muted_lock)
        } else {
            *is_muted_lock
        };
        let new_state = !actual_muted;
        
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            controller.set_mute_state(device_id, new_state)?;
        }
        
        *is_muted_lock = new_state;
        
        // Play sound feedback
        if new_state {
            sound::play_mute_sound();
        } else {
            sound::play_unmute_sound();
        }
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", new_state);
        
        // Update tray icon
        update_tray_icon(&app, new_state);
        
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
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            controller.set_mute_state(device_id, muted)?;
        }
        
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        *is_muted_lock = muted;
        
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
        if let Some(first_device) = profile.device_ids.first() {
            if let Ok(system_muted) = controller.get_mute_state(first_device) {
                let mut is_muted_lock = state.is_muted.lock().unwrap();
                *is_muted_lock = system_muted;
                return Ok(system_muted);
            }
        }
    }
    
    let is_muted_lock = state.is_muted.lock().unwrap();
    Ok(*is_muted_lock)
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
    
    // Note: Actual saving to store will be done from frontend using tauri-plugin-store
    // This command just validates the profile
    Ok(())
}

#[tauri::command]
fn set_active_profile(profile: HotkeyProfile, state: State<AppState>) -> Result<(), String> {
    // Set the new active profile
    let mut profile_lock = state.current_profile.lock().unwrap();
    *profile_lock = Some(profile.clone());
    
    Ok(())
}

#[tauri::command]
fn get_active_profile(state: State<AppState>) -> Result<Option<HotkeyProfile>, String> {
    let profile_lock = state.current_profile.lock().unwrap();
    Ok(profile_lock.clone())
}

#[tauri::command]
fn register_hotkey(hotkey: String, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let shortcut = Shortcut::from_str(&hotkey)
        .map_err(|e| format!("Invalid hotkey format: {}", e))?;
    
    // Unregister all existing shortcuts first
    let _ = app.global_shortcut().unregister_all();
    
    // Register the new shortcut
    let audio_controller = state.audio_controller.clone();
    let current_profile = state.current_profile.clone();
    let is_muted = state.is_muted.clone();
    
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            // Only toggle on key press, not on key release
            use tauri_plugin_global_shortcut::ShortcutState;
            if event.state != ShortcutState::Pressed {
                return;
            }
            
            // Toggle mute when hotkey is pressed
            let controller_lock = audio_controller.lock().unwrap();
            let profile_lock = current_profile.lock().unwrap();
            
            if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
                let mut is_muted_lock = is_muted.lock().unwrap();
                // Read actual mute state from system to stay in sync
                let actual_muted = if let Some(first_device) = profile.device_ids.first() {
                    controller.get_mute_state(first_device).unwrap_or(*is_muted_lock)
                } else {
                    *is_muted_lock
                };
                let new_state = !actual_muted;
                
                // Apply mute state to all devices in profile
                for device_id in &profile.device_ids {
                    let _ = controller.set_mute_state(device_id, new_state);
                }
                
                *is_muted_lock = new_state;
                
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
            }
        })
        .map_err(|e| format!("Failed to register hotkey: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn unregister_hotkey(app: AppHandle) -> Result<(), String> {
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

fn load_tray_image(app: &AppHandle, file_name: &str, fallback: &'static [u8]) -> TauriImage<'static> {
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

// Helper function to update the tray icon based on mute state
fn update_tray_icon(app: &AppHandle, is_muted: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let icon = if is_muted {
            load_tray_image(app, "tray-muted.png", TRAY_MUTED_BYTES)
        } else {
            load_tray_image(app, "tray-unmuted.png", TRAY_UNMUTED_BYTES)
        };
        let _ = tray.set_icon(Some(icon));
        let tooltip = if is_muted {
            "TogMic - Muted"
        } else {
            "TogMic - Unmuted"
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

// Helper function for hotkey callback
fn toggle_mute_internal(state: &AppState, app: &AppHandle) -> Result<bool, String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        // Read actual mute state from system to stay in sync
        let actual_muted = if let Some(first_device) = profile.device_ids.first() {
            controller.get_mute_state(first_device).unwrap_or(*is_muted_lock)
        } else {
            *is_muted_lock
        };
        let new_state = !actual_muted;
        
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            let _ = controller.set_mute_state(device_id, new_state);
        }
        
        *is_muted_lock = new_state;
        
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
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
                
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    
                    let state = app_handle.state::<AppState>();
                    
                    // Get the first device ID from the active profile
                    let device_id = {
                        let profile_lock = state.current_profile.lock().unwrap();
                        profile_lock.as_ref().and_then(|p| p.device_ids.first().cloned())
                    };
                    
                    if let Some(device_id) = device_id {
                        if let Ok(system_muted) = poll_controller.get_mute_state(&device_id) {
                            let mut is_muted_lock = state.is_muted.lock().unwrap();
                            if *is_muted_lock != system_muted {
                                *is_muted_lock = system_muted;
                                drop(is_muted_lock);
                                
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
