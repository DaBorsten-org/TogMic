import { createContext } from "react";

export interface MuteContextType {
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  setMute: (muted: boolean, silent?: boolean) => Promise<void>;
}

export const MuteContext = createContext<MuteContextType | undefined>(undefined);
