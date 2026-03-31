import { useContext } from "react";
import { MuteContext } from "@/contexts/MuteContext";

export function useMuteState() {
  const context = useContext(MuteContext);
  if (context === undefined) {
    throw new Error("useMuteState must be used within an AppProvider");
  }
  return context;
}
