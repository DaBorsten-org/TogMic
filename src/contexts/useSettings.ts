import { useContext } from "react";
import { SettingsContext } from "@/contexts/SettingsContext";

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within an AppProvider");
  }
  return context;
}
