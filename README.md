<div align="center">
  <img src="docs/screenshots/Application Icon.png" width="96" alt="TogMic Icon" />

# TogMic

A lightweight desktop app for controlling your microphone mute state via global hotkeys and system tray integration. Built with [Tauri 2](https://tauri.app/), React, and Rust.

</div>

---

## Features

- **Global hotkeys** — toggle mute/unmute from anywhere, even when the app is in the background
- **System tray** — quick access and mute indicator without cluttering your taskbar
- **Profiles** — create multiple hotkey/device configurations and switch between them
- **Audio feedback** — sound on mute/unmute
- **Multi-device support** — target a specific microphone, all inputs, or the system default
- **Auto-start** — optionally launch with Windows and start muted
- **Localization** — English and German UI

## Installation

Download the latest installer from the [Releases](../../releases/latest) page and run it.

> Currently supported: **Windows**

## Usage

1. Launch TogMic — it minimizes to the system tray.
2. Go to **Profiles** to create a profile with your desired hotkey and microphone(s).
3. Activate the profile. The global hotkey is now registered.
4. Press the hotkey anytime to toggle mute state.

## Screenshots

<img src="docs/screenshots/Dashboard Page.png" width="700" alt="TogMic Dashboard" />

_The dashboard shows the current microphone state and the active profile._

---

<img src="docs/screenshots/Profiles Page.png" width="700" alt="Profiles Page" />

_Manage multiple profiles with individual hotkeys and device assignments._

---

<img src="docs/screenshots/Tray Menu.png" width="280" alt="System Tray Menu" />

_The system tray icon shows mute state at a glance — right-click for quick controls._

## Configuration

### Device IDs

| Value         | Description                        |
| ------------- | ---------------------------------- |
| `default-mic` | System default input device        |
| `all-mics`    | All input devices simultaneously   |
| _(device ID)_ | A specific microphone by system ID |

### Hotkey Variants

When `ignoreModifiers` is enabled, TogMic registers 8 hotkey variants covering all combinations of Ctrl, Alt, and Shift — so your hotkey fires regardless of which modifiers are held.

## Development

### Prerequisites

- [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/)

### Setup

```bash
git clone https://github.com/DaBorsten-org/TogMic.git
cd TogMic
bun install
```

### Dev server

```bash
# Frontend only (Vite on localhost:1420)
bun run dev

# Full app with Rust backend (recommended)
bun run tauri dev
```

### Build

```bash
# Type-check + build frontend
bun run build

# Build desktop installer
bun run tauri build
```

### Lint

```bash
bunx eslint src/
```

## Project Structure

```
src/                    # React frontend
  contexts/AppContent.tsx   # Global app state (profiles, devices, mute state)
  pages/                    # Dashboard, Profiles, Settings
  components/ui/            # shadcn/ui components
  i18n.ts                   # i18n setup
public/locales/         # Translation files (en, de)
src-tauri/src/          # Rust backend
  lib.rs                    # Tauri commands, tray, config persistence
  audio/                    # Platform audio controllers
  sound.rs                  # Audio feedback (WAV playback)
```

## Tech Stack

| Layer           | Technology                 |
| --------------- | -------------------------- |
| Framework       | Tauri 2                    |
| Frontend        | React 19, TypeScript, Vite |
| Styling         | Tailwind CSS v4, shadcn/ui |
| Backend         | Rust                       |
| Audio (Windows) | Windows COM / WASAPI       |
| Package manager | Bun                        |

## License

<a href="LICENSE">MIT License</a>
