import { createContext, useContext } from "react";

export type Theme = "light" | "dark" | "system";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {
    // ponytail: default no-op, real setter comes from ThemeProvider
  },
  resolvedTheme: "light",
});

export function useTheme() {
  return useContext(ThemeContext);
}
