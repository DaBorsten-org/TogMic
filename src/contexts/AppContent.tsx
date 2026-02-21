import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface HotkeyProfile {
  id: string;
  name: string;
  toggleKey: string;
  deviceIds: string[];
  ignoreModifiers?: boolean;
}

export interface AppSettings {
  startMuted: boolean;
  autostart: boolean;
  checkUpdates: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
}

export interface Config {
  profiles: HotkeyProfile[];
  activeProfileId: string | null;
  appSettings: AppSettings;
}

interface AppContextType {
  devices: AudioDevice[];
  profiles: HotkeyProfile[];
  activeProfile: HotkeyProfile | null;
  isMuted: boolean;
  settings: AppSettings;
  refreshDevices: () => Promise<void>;
  toggleMute: () => Promise<void>;
  setMute: (muted: boolean) => Promise<void>;
  saveProfile: (profile: HotkeyProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (profile: HotkeyProfile) => Promise<void>;
  deactivateProfile: () => Promise<void>;
  registerHotkey: (hotkey: string) => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [profiles, setProfiles] = useState<HotkeyProfile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<HotkeyProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    startMuted: true,
    autostart: true,
    checkUpdates: true,
    closeToTray: true,
    startMinimized: true,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const startupApplied = useRef(false);
  const { t, i18n } = useTranslation();

  // Sync tray menu labels whenever language changes
  useEffect(() => {
    invoke('update_tray_labels', {
      mute: t('trayMute'),
      unmute: t('trayUnmute'),
      show: t('trayShowWindow'),
      quit: t('trayQuit'),
      mutedTooltip: t('trayMutedTooltip'),
      unmutedTooltip: t('trayUnmutedTooltip'),
    }).catch(console.error);
  }, [i18n.language]);

  // Load config from backend
  const loadConfig = async () => {
    try {
      const config = await invoke<Config>('load_config');
      setProfiles(config.profiles);
      setSettings(config.appSettings);

      // Auto-load the last active profile
      if (config.activeProfileId && config.profiles) {
        const active = config.profiles.find((p) => p.id === config.activeProfileId);
        if (active) {
          await setActiveProfile(active);
        }
      }
      
      setConfigLoaded(true);
    } catch (error) {
      console.error('Failed to load config:', error);
      setConfigLoaded(true);
    }
  };

  // Save config to backend
  const saveConfig = async (updatedConfig: Partial<Config>) => {
    try {
      const config: Config = {
        profiles: updatedConfig.profiles ?? profiles,
        activeProfileId: updatedConfig.activeProfileId !== undefined ? updatedConfig.activeProfileId : activeProfile?.id ?? null,
        appSettings: updatedConfig.appSettings ?? settings,
      };
      await invoke('save_config', { config });
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  };

  // Refresh devices list
  const refreshDevices = async () => {
    try {
      const devicesList = await invoke<AudioDevice[]>('get_audio_devices');
      setDevices(devicesList);
    } catch (error) {
      console.error('Failed to get devices:', error);
    }
  };

  // Toggle mute state
  const toggleMute = async () => {
    try {
      const newState = await invoke<boolean>('toggle_mute');
      setIsMuted(newState);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      throw error;
    }
  };

  // Set mute state explicitly
  const setMute = async (muted: boolean, silent?: boolean) => {
    try {
      await invoke('set_mute', { muted, silent });
      setIsMuted(muted);
    } catch (error) {
      console.error('Failed to set mute:', error);
      throw error;
    }
  };

  // Save profile
  const saveProfile = async (profile: HotkeyProfile) => {
    try {
      // Validate with backend
      await invoke('save_profile', { profile });

      // Update local state
      const existingIndex = profiles.findIndex((p: HotkeyProfile) => p.id === profile.id);
      let updatedProfiles: HotkeyProfile[];
      
      if (existingIndex >= 0) {
        updatedProfiles = [...profiles];
        updatedProfiles[existingIndex] = profile;
      } else {
        updatedProfiles = [...profiles, profile];
      }

      setProfiles(updatedProfiles);
      await saveConfig({ profiles: updatedProfiles });

      // If the saved profile is currently active, reactivate it to apply changes
      if (activeProfile?.id === profile.id) {
        await setActiveProfile(profile);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      throw error;
    }
  };

  // Delete profile
  const deleteProfile = async (id: string) => {
    try {
      const updatedProfiles = profiles.filter((p: HotkeyProfile) => p.id !== id);
      setProfiles(updatedProfiles);

      // If deleted profile was active, unregister hotkey and clear active profile
      if (activeProfile?.id === id) {
        // Unregister hotkey first
        await invoke('unregister_hotkey');
        
        setActiveProfileState(null);
        await saveConfig({ 
          profiles: updatedProfiles,
          activeProfileId: null 
        });
      } else {
        await saveConfig({ profiles: updatedProfiles });
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
      throw error;
    }
  };

  // Set active profile
  const setActiveProfile = async (profile: HotkeyProfile) => {
    try {
      // Set in backend
      await invoke('set_active_profile', { profile });
      
      // Register hotkey
      await invoke('register_hotkey', { hotkey: profile.toggleKey, ignoreModifiers: profile.ignoreModifiers ?? false });
      
      // Update local state
      setActiveProfileState(profile);
      await saveConfig({ activeProfileId: profile.id });

      // Get current mute state
      const muteState = await invoke<boolean>('get_mute_state');
      setIsMuted(muteState);
    } catch (error) {
      console.error('Failed to set active profile:', error);
      throw error;
    }
  };

  // Deactivate current profile
  const deactivateProfile = async () => {
    try {
      // Unregister hotkey
      await invoke('unregister_hotkey');
      
      // Clear active profile
      setActiveProfileState(null);
      await saveConfig({ activeProfileId: null });
    } catch (error) {
      console.error('Failed to deactivate profile:', error);
      throw error;
    }
  };

  // Register hotkey
  const registerHotkey = async (hotkey: string) => {
    try {
      await invoke('register_hotkey', { hotkey });
    } catch (error) {
      console.error('Failed to register hotkey:', error);
      throw error;
    }
  };

  // Update settings
  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);
      await saveConfig({ appSettings: updatedSettings });

      // Apply autostart setting
      if (newSettings.autostart !== undefined) {
        await invoke('set_autostart', { enabled: newSettings.autostart });
      }

      // Apply close to tray setting
      if (newSettings.closeToTray !== undefined) {
        await invoke('set_close_to_tray', { enabled: newSettings.closeToTray });
      }

      // Note: startMuted is only applied on app startup, not when toggling the setting
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  };

  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      await refreshDevices();
      await loadConfig();
      
      setConfigLoaded(true);
    };
    
    init();

    // Listen for mute state changes
    const unlistenMute = listen<boolean>('mute-state-changed', (event) => {
      if (mounted) {
        setIsMuted(event.payload);
      }
    });

    return () => {
      mounted = false;
      unlistenMute.then(fn => fn());
    };
  }, []);

  // Apply startup-only settings once after config is loaded.
  // This ensures toggling `startMuted` in settings doesn't immediately mute the app;
  // startMuted should only take effect on the next application start.
  useEffect(() => {
    if (configLoaded && !startupApplied.current) {
      // Apply start muted if enabled (only once at startup)
      if (settings.startMuted) {
        setMute(true, true); // Silent mute on startup
      }

      // Sync close-to-tray setting with backend on startup
      if (settings.closeToTray !== undefined) {
        invoke('set_close_to_tray', { enabled: settings.closeToTray });
      }

      startupApplied.current = true;
    }
  }, [configLoaded]);

  const value: AppContextType = {
    devices,
    profiles,
    activeProfile,
    isMuted,
    settings,
    refreshDevices,
    toggleMute,
    setMute,
    saveProfile,
    deleteProfile,
    setActiveProfile,
    deactivateProfile,
    registerHotkey,
    updateSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
