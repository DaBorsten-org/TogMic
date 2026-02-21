# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (Vite on localhost:1420)
bun run dev

# Full Tauri app (Rust + frontend, recommended for dev)
bun run tauri dev

# Type-check + build frontend
bun run build

# Build full desktop app (creates installer)
bun run tauri build

# Lint
bunx eslint src/
```

No test suite is currently configured.

## Architecture

**TogMic** is a Tauri 2 desktop app for controlling microphone mute state via global hotkeys and system tray integration.

### Frontend (`src/`)

- **Entry**: `main.tsx` → `App.tsx` → `ComponentExample` (layout with sidebar + routing)
- **State**: `src/contexts/AppContent.tsx` — single React Context for all app state: profiles, devices, mute state, settings. Listens to `mute-state-changed` events from Rust via Tauri's event system.
- **Pages**: `dashboard/`, `profiles/`, `settings/` — purely presentational, call Tauri commands via `@tauri-apps/api/core`'s `invoke()`
- **i18n**: `src/i18n.ts` + `public/locales/{en,de}/translation.json` — use `t()` from `useTranslation()` everywhere; no hardcoded UI strings
- **UI**: shadcn/ui components in `src/components/ui/`, Tailwind CSS v4 with `@plugin "@tailwindcss/typography"` registered in `src/index.css`

### Backend (`src-tauri/src/`)

- **`lib.rs`**: All Tauri commands, app setup, tray menu, config persistence (`AppConfig/config.json` via platform config dir)
- **`audio/mod.rs`**: `AudioController` trait; platform implementations in `windows.rs` (Windows COM), `macos.rs` (CoreAudio), `linux.rs` (PulseAudio)
- **`sound.rs`**: Plays embedded WAV feedback sounds on mute/unmute (Windows only currently)

### IPC Pattern

Frontend → Rust: `invoke("command_name", { args })` returns `Promise<Result>`
Rust → Frontend: `app.emit("mute-state-changed", payload)` listened to in `AppContent.tsx`

All commands return `Result<T, String>` — errors surface as toast notifications via sonner.

### Key Domain Concepts

- **Profiles**: Named configs with a `toggleKey` hotkey, list of `deviceIds`, and optional `ignoreModifiers` flag (registers 8 hotkey variants with Ctrl/Alt/Shift combinations)
- **Device IDs**: `"default-mic"` = system default, `"all-mics"` = all input devices, otherwise a system device ID
- **Mute state**: Cached as `Arc<AtomicBool>` in Rust; polled every 500ms to catch external changes; emitted as events to frontend
- **Config**: Auto-loaded on startup; active profile auto-activated; `startMuted` only applies at launch
