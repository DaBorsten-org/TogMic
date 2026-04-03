import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AppContext,
  type AudioDevice,
  type HotkeyProfile,
  type AppSettings,
  type Config,
  type AppContextType,
} from "@/contexts/AppContext";
import { MuteContext, type MuteContextType } from "@/contexts/MuteContext";
import { SettingsContext, type SettingsContextType } from "@/contexts/SettingsContext";

export function AppProvider({ children, onNavigateToUpdates, onRequestInstall }: { children: ReactNode; onNavigateToUpdates?: (version: string, body?: string, date?: string) => void; onRequestInstall?: () => void }) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [profiles, setProfiles] = useState<HotkeyProfile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<HotkeyProfile | null>(
    null,
  );
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
  const storeRef = useRef<Store | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);
  const onNavigateToUpdatesRef = useRef(onNavigateToUpdates);
  onNavigateToUpdatesRef.current = onNavigateToUpdates;
  const onRequestInstallRef = useRef(onRequestInstall);
  onRequestInstallRef.current = onRequestInstall;
  const { t, i18n } = useTranslation();

  // Keep refs in sync so stable useCallbacks always read latest state
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const getStore = async () => {
    if (!storeRef.current) {
      storeRef.current = await load("config.json", {
        autoSave: false,
        defaults: {}
      });
    }
    return storeRef.current;
  };

  // Sync tray menu labels whenever language changes
  useEffect(() => {
    invoke("update_tray_labels", {
      mute: t("trayMute"),
      unmute: t("trayUnmute"),
      show: t("trayShowWindow"),
      quit: t("trayQuit"),
      mutedTooltip: t("trayMutedTooltip"),
      unmutedTooltip: t("trayUnmutedTooltip"),
    }).catch(console.error);
  }, [i18n.language, t]);

  // Load config from store
  const loadConfig = useCallback(async () => {
    try {
      const store = await getStore();
      const loadedProfiles =
        (await store.get<HotkeyProfile[]>("profiles")) ?? [];
      const loadedActiveProfileId =
        (await store.get<string | null>("activeProfileId")) ?? null;
      const loadedSettings = (await store.get<AppSettings>("appSettings")) ?? {
        startMuted: true,
        autostart: true,
        checkUpdates: true,
        closeToTray: true,
        startMinimized: true,
      };

      setProfiles(loadedProfiles);
      setSettings(loadedSettings);

      // Auto-load the last active profile.
      // We intentionally do NOT call setActiveProfile() here because that function
      // calls saveConfig(), which would read stale React state (profiles = []) and
      // overwrite the config file with an empty profiles array.
      if (loadedActiveProfileId) {
        const active = loadedProfiles.find(
          (p) => p.id === loadedActiveProfileId,
        );
        if (active) {
          await invoke("set_active_profile", { profile: active });
          await invoke("register_hotkey", {
            hotkey: active.toggleKey,
            ignoreModifiers: active.ignoreModifiers ?? false,
          });
          setActiveProfileState(active);
          const muteState = await invoke<boolean>("get_mute_state");
          setIsMuted(muteState);
        }
      }

      setConfigLoaded(true);
    } catch (error) {
      console.error("Failed to load config:", error);
      setConfigLoaded(true);
    }
  }, []);

  // Save config to store — stable callback that reads from refs
  const saveConfig = useCallback(async (updatedConfig: Partial<Config>) => {
    try {
      const store = await getStore();
      await store.set("profiles", updatedConfig.profiles ?? profilesRef.current);
      await store.set(
        "activeProfileId",
        updatedConfig.activeProfileId !== undefined
          ? updatedConfig.activeProfileId
          : (activeProfileRef.current?.id ?? null),
      );
      await store.set("appSettings", updatedConfig.appSettings ?? settingsRef.current);
      await store.save();
    } catch (error) {
      console.error("Failed to save config:", error);
      throw error;
    }
  }, []);

  // Refresh devices list
  const refreshDevices = useCallback(async () => {
    try {
      const devicesList = await invoke<AudioDevice[]>("get_audio_devices");
      setDevices(devicesList);
    } catch (error) {
      console.error("Failed to get devices:", error);
    }
  }, []);

  // Toggle mute state
  const toggleMute = useCallback(async () => {
    try {
      const newState = await invoke<boolean>("toggle_mute");
      setIsMuted(newState);
    } catch (error) {
      console.error("Failed to toggle mute:", error);
      throw error;
    }
  }, []);

  // Set mute state explicitly
  const setMute = useCallback(async (muted: boolean, silent?: boolean) => {
    try {
      await invoke("set_mute", { muted, silent });
      setIsMuted(muted);
    } catch (error) {
      console.error("Failed to set mute:", error);
      throw error;
    }
  }, []);

  // Save profile
  const saveProfile = useCallback(async (profile: HotkeyProfile) => {
    try {
      // Validate with backend
      await invoke("save_profile", { profile });

      // Update local state
      const currentProfiles = profilesRef.current;
      const existingIndex = currentProfiles.findIndex(
        (p: HotkeyProfile) => p.id === profile.id,
      );
      let updatedProfiles: HotkeyProfile[];

      if (existingIndex >= 0) {
        updatedProfiles = [...currentProfiles];
        updatedProfiles[existingIndex] = profile;
      } else {
        updatedProfiles = [...currentProfiles, profile];
      }

      setProfiles(updatedProfiles);
      await saveConfig({ profiles: updatedProfiles });

      // If the saved profile is currently active, reactivate it to apply changes
      if (activeProfileRef.current?.id === profile.id) {
        await setActiveProfile(profile);
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      throw error;
    }
  }, [saveConfig]);

  // Delete profile
  const deleteProfile = useCallback(async (id: string) => {
    try {
      const updatedProfiles = profilesRef.current.filter(
        (p: HotkeyProfile) => p.id !== id,
      );
      setProfiles(updatedProfiles);

      // If deleted profile was active, unregister hotkey and clear active profile
      if (activeProfileRef.current?.id === id) {
        // Unregister hotkey first
        await invoke("unregister_hotkey");

        setActiveProfileState(null);
        await saveConfig({
          profiles: updatedProfiles,
          activeProfileId: null,
        });
      } else {
        await saveConfig({ profiles: updatedProfiles });
      }
    } catch (error) {
      console.error("Failed to delete profile:", error);
      throw error;
    }
  }, [saveConfig]);

  // Set active profile
  const setActiveProfile = useCallback(async (profile: HotkeyProfile) => {
    try {
      // Set in backend
      await invoke("set_active_profile", { profile });

      // Register hotkey
      await invoke("register_hotkey", {
        hotkey: profile.toggleKey,
        ignoreModifiers: profile.ignoreModifiers ?? false,
      });

      // Update local state
      setActiveProfileState(profile);
      await saveConfig({ activeProfileId: profile.id });

      // Get current mute state
      const muteState = await invoke<boolean>("get_mute_state");
      setIsMuted(muteState);
    } catch (error) {
      console.error("Failed to set active profile:", error);
      throw error;
    }
  }, [saveConfig]);

  // Deactivate current profile
  const deactivateProfile = useCallback(async () => {
    try {
      // Unregister hotkey
      await invoke("unregister_hotkey");

      // Clear active profile
      setActiveProfileState(null);
      await saveConfig({ activeProfileId: null });
    } catch (error) {
      console.error("Failed to deactivate profile:", error);
      throw error;
    }
  }, [saveConfig]);

  // Register hotkey
  const registerHotkey = useCallback(async (hotkey: string) => {
    try {
      await invoke("register_hotkey", { hotkey });
    } catch (error) {
      console.error("Failed to register hotkey:", error);
      throw error;
    }
  }, []);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settingsRef.current, ...newSettings };
      setSettings(updatedSettings);
      await saveConfig({ appSettings: updatedSettings });

      // Apply autostart setting
      if (newSettings.autostart !== undefined) {
        await invoke("set_autostart", { enabled: newSettings.autostart });
      }

      // Apply close to tray setting
      if (newSettings.closeToTray !== undefined) {
        await invoke("set_close_to_tray", { enabled: newSettings.closeToTray });
      }

      // Note: startMuted is only applied on app startup, not when toggling the setting
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  }, [saveConfig]);

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
    const unlistenMute = listen<boolean>("mute-state-changed", (event) => {
      if (mounted) {
        setIsMuted(event.payload);
      }
    });

    // When window gains focus after a background notification, navigate to updates and show toast
    const win = getCurrentWindow();
    const unlistenFocus = win.listen("tauri://focus", () => {
      if (!mounted) return;
      const update = pendingUpdateRef.current;
      if (!update) return;
      pendingUpdateRef.current = null;
      onNavigateToUpdatesRef.current?.(update.version, update.body, update.date ?? undefined);
      toast(t("updateAvailable", { version: update.version }), {
        duration: Infinity,
        action: {
          label: t("update"),
          onClick: () => {
            onRequestInstallRef.current?.();
          },
        },
      });
    });

    return () => {
      mounted = false;
      unlistenMute.then((fn) => fn());
      unlistenFocus.then((fn) => fn());
    };
  }, [loadConfig, t]);

  // Apply startup-only settings once after config is loaded.
  // This ensures toggling `startMuted` in settings doesn't immediately mute the app;
  // startMuted should only take effect on the next application start.
  useEffect(() => {
    if (!configLoaded || startupApplied.current) return;
    startupApplied.current = true;

    // start_muted is now handled by the Rust backend immediately at launch,
    // so we only need to sync the frontend's isMuted state with the backend.
    invoke<boolean>("get_mute_state")
      .then((muted) => setIsMuted(muted))
      .catch(console.error);

    // Sync close-to-tray setting with backend on startup
    if (settings.closeToTray !== undefined) {
      invoke("set_close_to_tray", { enabled: settings.closeToTray }).catch(
        console.error,
      );
    }

    // Auto-check for updates on startup if enabled
    if (settings.checkUpdates) {
      check()
        .then(async (update) => {
          if (update) {
            const win = getCurrentWindow();
            const isVisible = await win.isVisible();
            if (!isVisible) {
              pendingUpdateRef.current = update;
              invoke("show_update_notification", {
                title: t("updateAvailable", { version: update.version }),
                body: t("updateNotificationBody"),
              }).catch(console.error);
            } else {
              toast(t("updateAvailable", { version: update.version }), {
                duration: Infinity,
                action: {
                  label: t("update"),
                  onClick: async () => {
                    await update.downloadAndInstall();
                    await relaunch();
                  },
                },
              });
            }
          }
        })
        .catch(console.error);
    }
  }, [configLoaded, settings.startMuted, settings.closeToTray, settings.checkUpdates, t]);

  const muteValue: MuteContextType = useMemo(() => ({
    isMuted,
    toggleMute,
    setMute,
  }), [isMuted, toggleMute, setMute]);

  const appValue: AppContextType = useMemo(() => ({
    devices,
    profiles,
    activeProfile,
    refreshDevices,
    saveProfile,
    deleteProfile,
    setActiveProfile,
    deactivateProfile,
    registerHotkey,
  }), [devices, profiles, activeProfile, refreshDevices, saveProfile, deleteProfile, setActiveProfile, deactivateProfile, registerHotkey]);

  const settingsValue: SettingsContextType = useMemo(() => ({
    settings,
    updateSettings,
  }), [settings, updateSettings]);

  return (
    <MuteContext.Provider value={muteValue}>
      <SettingsContext.Provider value={settingsValue}>
        <AppContext.Provider value={appValue}>{children}</AppContext.Provider>
      </SettingsContext.Provider>
    </MuteContext.Provider>
  );
}
