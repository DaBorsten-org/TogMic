import { createContext } from "react";

export interface MuteLogEntry {
  id: number;
  muted: boolean;
  timestamp: number;
  profileName: string | null;
  deviceIds: string[];
}

export interface MuteContextType {
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  setMute: (muted: boolean, silent?: boolean) => Promise<void>;
  activity: MuteLogEntry[];
  clearActivity: () => void;
}

export const MuteContext = createContext<MuteContextType | undefined>(
  undefined,
);
