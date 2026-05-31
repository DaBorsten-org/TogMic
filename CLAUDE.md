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

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
