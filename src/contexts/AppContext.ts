import { createContext } from "react";

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
  // Last known display name per device ID, maintained by the backend
  deviceNames?: Record<string, string>;
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

export interface AppContextType {
  devices: AudioDevice[];
  profiles: HotkeyProfile[];
  activeProfile: HotkeyProfile | null;
  resolveDeviceLabel: (deviceId: string) => string;
  refreshDevices: () => Promise<void>;
  saveProfile: (profile: HotkeyProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (profile: HotkeyProfile) => Promise<void>;
  deactivateProfile: () => Promise<void>;
  registerHotkey: (hotkey: string) => Promise<void>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
