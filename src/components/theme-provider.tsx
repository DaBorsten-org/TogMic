import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ThemeContext, type Theme } from "@/components/theme-context";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("togmic-theme") ?? "system") as Theme;
  });

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "dark"
      ? "dark"
      : theme === "light"
        ? "light"
        : systemDark
          ? "dark"
          : "light";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    // Pass the raw theme so "system" maps to `None` natively and the window
    // keeps following the OS — pinning it to a concrete value freezes the
    // webview's prefers-color-scheme and breaks live OS theme changes.
    invoke("set_window_theme", { theme }).catch(() => {});
  }, [resolvedTheme, theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("togmic-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
