import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Pre-bundle all known heavy dependencies at server start instead of on first page request.
  // Without this, Vite holds the initial HTML response for 10-15s while esbuild bundles on demand.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "i18next",
      "react-i18next",
      "i18next-http-backend",
      "i18next-browser-languagedetector",
      "lucide-react",
      "sonner",
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/api/window",
      "@tauri-apps/plugin-store",
      "@tauri-apps/plugin-updater",
      "@tauri-apps/plugin-process",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
