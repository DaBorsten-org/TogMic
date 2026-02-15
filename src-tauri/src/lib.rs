mod audio;

use audio::{AudioController, AudioDevice, PlatformAudioController};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, menu::{MenuBuilder, MenuItemBuilder}};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use std::str::FromStr;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyProfile {
    pub id: String,
    pub name: String,
    pub toggle_key: String,
    pub device_ids: Vec<String>,
    pub start_muted: bool,
}

#[derive(Default)]
pub struct AppState {
    pub current_profile: Arc<Mutex<Option<HotkeyProfile>>>,
    pub is_muted: Arc<Mutex<bool>>,
    pub devices: Arc<Mutex<Vec<AudioDevice>>>,
    pub audio_controller: Arc<Mutex<Option<PlatformAudioController>>>,
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
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        let new_state = !*is_muted_lock;
        
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            controller.set_mute_state(device_id, new_state)?;
        }
        
        *is_muted_lock = new_state;
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", new_state);
        
        Ok(new_state)
    } else {
        Err("No active profile or audio controller not initialized".to_string())
    }
}

#[tauri::command]
fn set_mute(muted: bool, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            controller.set_mute_state(device_id, muted)?;
        }
        
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        *is_muted_lock = muted;
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", muted);
        
        Ok(())
    } else {
        Err("No active profile or audio controller not initialized".to_string())
    }
}

#[tauri::command]
fn get_mute_state(state: State<AppState>) -> Result<bool, String> {
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
fn set_active_profile(profile: HotkeyProfile, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    // Set the new active profile
    let mut profile_lock = state.current_profile.lock().unwrap();
    *profile_lock = Some(profile.clone());
    
    // Apply start_muted state if specified
    if profile.start_muted {
        let controller_lock = state.audio_controller.lock().unwrap();
        if let Some(controller) = controller_lock.as_ref() {
            for device_id in &profile.device_ids {
                let _ = controller.set_mute_state(device_id, true);
            }
            
            let mut is_muted_lock = state.is_muted.lock().unwrap();
            *is_muted_lock = true;
            
            let _ = app.emit("mute-state-changed", true);
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
                let new_state = !*is_muted_lock;
                
                // Apply mute state to all devices in profile
                for device_id in &profile.device_ids {
                    let _ = controller.set_mute_state(device_id, new_state);
                }
                
                *is_muted_lock = new_state;
                
                // Emit event to frontend
                let _ = app.emit("mute-state-changed", new_state);
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

// Helper function for hotkey callback
fn toggle_mute_internal(state: &AppState, app: &AppHandle) -> Result<bool, String> {
    let controller_lock = state.audio_controller.lock().unwrap();
    let profile_lock = state.current_profile.lock().unwrap();
    
    if let (Some(controller), Some(profile)) = (controller_lock.as_ref(), profile_lock.as_ref()) {
        let mut is_muted_lock = state.is_muted.lock().unwrap();
        let new_state = !*is_muted_lock;
        
        // Apply mute state to all devices in profile
        for device_id in &profile.device_ids {
            let _ = controller.set_mute_state(device_id, new_state);
        }
        
        *is_muted_lock = new_state;
        
        // Emit event to frontend
        let _ = app.emit("mute-state-changed", new_state);
        
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
    
    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("TogMic - Microphone Control")
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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
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
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
