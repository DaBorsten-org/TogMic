import { createContext } from "react";
import type { AppSettings } from "@/contexts/AppContext";

export interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
