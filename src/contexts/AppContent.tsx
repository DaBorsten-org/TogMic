import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export interface HotkeyProfile {
  id: string;
  name: string;
  toggle_key: string;
  device_ids: string[];
}

export interface AppSettings {
  startMuted: boolean;
  autostart: boolean;
  checkUpdates: boolean;
  closeToTray: boolean;
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
  registerHotkey: (hotkey: string) => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [profiles, setProfiles] = useState<HotkeyProfile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<HotkeyProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    startMuted: false,
    autostart: false,
    checkUpdates: true,
    closeToTray: false,
  });

  // Initialize store
  useEffect(() => {
    const initStore = async () => {
      const storeInstance = await Store.load('settings.json');
      setStore(storeInstance);
    };
    initStore();
  }, []);

  // Load profiles from store
  const loadProfiles = async () => {
    if (!store) return;
    
    try {
      const storedProfiles = await store.get<HotkeyProfile[]>('profiles');
      if (storedProfiles) {
        setProfiles(storedProfiles);
      }

      // Auto-load the last active profile
      const activeProfileId = await store.get<string>('active_profile_id');
      if (activeProfileId && storedProfiles) {
        const active = storedProfiles.find((p: HotkeyProfile) => p.id === activeProfileId);
        if (active) {
          await setActiveProfile(active);
        }
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
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
    if (!store) return;
    
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
      await store.set('profiles', updatedProfiles);
      await store.save();
    } catch (error) {
      console.error('Failed to save profile:', error);
      throw error;
    }
  };

  // Delete profile
  const deleteProfile = async (id: string) => {
    if (!store) return;
    
    try {
      const updatedProfiles = profiles.filter((p: HotkeyProfile) => p.id !== id);
      setProfiles(updatedProfiles);
      await store.set('profiles', updatedProfiles);
      await store.save();

      // If deleted profile was active, clear active profile
      if (activeProfile?.id === id) {
        setActiveProfileState(null);
        await store.delete('active_profile_id');
        await store.save();
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
      throw error;
    }
  };

  // Set active profile
  const setActiveProfile = async (profile: HotkeyProfile) => {
    if (!store) return;
    
    try {
      // Set in backend
      await invoke('set_active_profile', { profile });
      
      // Register hotkey
      await invoke('register_hotkey', { hotkey: profile.toggle_key });
      
      // Update local state
      setActiveProfileState(profile);
      await store.set('active_profile_id', profile.id);
      await store.save();

      // Get current mute state
      const muteState = await invoke<boolean>('get_mute_state');
      setIsMuted(muteState);
    } catch (error) {
      console.error('Failed to set active profile:', error);
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
    if (!store) return;
    
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);
      await store.set('app_settings', updatedSettings);
      await store.save();

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
    if (!store) return;
    
    let mounted = true;
    
    const init = async () => {
      // Load settings
      try {
        const storedSettings = await store.get<AppSettings>('app_settings');
        if (storedSettings && mounted) {
          setSettings(storedSettings);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }

      await refreshDevices();
      await loadProfiles();

      // Apply start muted if enabled and profile is active
      const storedSettings = await store.get<AppSettings>('app_settings');
      if (storedSettings?.startMuted && mounted) {
        await setMute(true, true); // Silent mute on startup
      }

      // Sync close-to-tray setting with backend
      if (storedSettings?.closeToTray !== undefined) {
        await invoke('set_close_to_tray', { enabled: storedSettings.closeToTray });
      }
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
  }, [store]);

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
