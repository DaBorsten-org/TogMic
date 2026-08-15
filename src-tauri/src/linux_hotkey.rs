//! GNOME/Wayland hotkey fallback.
//!
//! `tauri-plugin-global-shortcut` grabs keys through X11 (`XGrabKey`), which never fires under a
//! Wayland session — the compositor simply doesn't route keys to X clients. Instead of grabbing,
//! we ask GNOME to run `togmic --toggle` for us via a custom media-key binding; the running
//! instance picks that up through the single-instance plugin.

use std::process::Command;

/// dconf path prefix for the entries we own. Anything under here is ours to rewrite.
const PATH_PREFIX: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/togmic";
const MEDIA_KEYS_SCHEMA: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM_SCHEMA: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";

/// The modifier combinations `ignore_modifiers` expands to. Unlike the built-in media keys,
/// a custom keybinding's `binding` is a plain string, so each variant needs its own entry.
const MODIFIER_PREFIXES: [&str; 8] = [
    "",
    "<Control>",
    "<Alt>",
    "<Shift>",
    "<Control><Alt>",
    "<Control><Shift>",
    "<Alt><Shift>",
    "<Control><Alt><Shift>",
];

/// Whether this session needs the gsettings fallback. On X11 the normal grab works and consumes
/// the key, so we leave it alone there — running both would toggle twice.
pub fn is_active() -> bool {
    let wayland = std::env::var("XDG_SESSION_TYPE")
        .map(|s| s.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var("WAYLAND_DISPLAY").is_ok();

    let gnome = std::env::var("XDG_CURRENT_DESKTOP")
        .map(|s| s.to_ascii_lowercase().contains("gnome"))
        .unwrap_or(false);

    wayland && gnome && gsettings_available()
}

fn gsettings_available() -> bool {
    Command::new("gsettings")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Translate a Tauri shortcut string ("CommandOrControl+Shift+F10") into a GNOME accelerator
/// ("<Control><Shift>F10"). Returns `None` for keys we can't map to a keysym.
pub fn to_gnome_accelerator(hotkey: &str) -> Option<String> {
    let mut modifiers = String::new();
    let mut key: Option<String> = None;

    for part in hotkey.split('+') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        match part.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "cmdorctrl" | "control" | "ctrl" => modifiers.push_str("<Control>"),
            "alt" | "option" => modifiers.push_str("<Alt>"),
            "shift" => modifiers.push_str("<Shift>"),
            "super" | "meta" | "command" | "cmd" => modifiers.push_str("<Super>"),
            _ => key = Some(to_keysym(part)?),
        }
    }

    key.map(|k| format!("{}{}", modifiers, k))
}

/// Map a single key name to an X keysym name, which is what GNOME accelerators are parsed as.
fn to_keysym(key: &str) -> Option<String> {
    // F1-F24 are already keysym names.
    if let Some(num) = key.strip_prefix('F').or_else(|| key.strip_prefix('f')) {
        if let Ok(n) = num.parse::<u32>() {
            if (1..=24).contains(&n) {
                return Some(format!("F{}", n));
            }
        }
    }

    // Letters and digits: keysyms for letters are lowercase; an uppercase name means shift+key.
    if key.chars().count() == 1 {
        let c = key.chars().next()?;
        if c.is_ascii_alphanumeric() {
            return Some(c.to_ascii_lowercase().to_string());
        }
    }

    let named = match key.to_ascii_lowercase().as_str() {
        "space" => "space",
        "enter" | "return" => "Return",
        "tab" => "Tab",
        "escape" | "esc" => "Escape",
        "backspace" => "BackSpace",
        "delete" => "Delete",
        "insert" => "Insert",
        "home" => "Home",
        "end" => "End",
        "pageup" => "Prior",
        "pagedown" => "Next",
        "arrowup" | "up" => "Up",
        "arrowdown" | "down" => "Down",
        "arrowleft" | "left" => "Left",
        "arrowright" | "right" => "Right",
        "pause" => "Pause",
        "scrolllock" => "Scroll_Lock",
        "printscreen" => "Print",
        _ => return None,
    };
    Some(named.to_string())
}

/// Install GNOME keybindings for `hotkey`, replacing any we installed previously.
pub fn register(hotkey: &str, ignore_modifiers: bool) -> Result<(), String> {
    let accelerator = to_gnome_accelerator(hotkey)
        .ok_or_else(|| format!("Cannot map hotkey '{}' to a GNOME accelerator", hotkey))?;

    let exe = std::env::current_exe()
        .map_err(|e| format!("Cannot determine executable path: {}", e))?;
    // GNOME runs this through g_shell_parse_argv, so the path needs shell quoting of its own.
    let command = format!("\"{}\" --toggle", exe.display());

    // Without modifiers in the accelerator there is nothing to prefix onto, so the
    // ignore_modifiers variants are only meaningful for a bare key.
    let bindings: Vec<String> = if ignore_modifiers && !accelerator.starts_with('<') {
        MODIFIER_PREFIXES
            .iter()
            .map(|p| format!("{}{}", p, accelerator))
            .collect()
    } else {
        vec![accelerator]
    };

    // Drop stale entries first so a shrinking binding count doesn't leave orphans behind.
    remove_our_entries()?;

    let mut paths = Vec::new();
    for (i, binding) in bindings.iter().enumerate() {
        let path = format!("{}{}/", PATH_PREFIX, i);
        let schema = format!("{}:{}", CUSTOM_SCHEMA, path);
        set_string(&schema, "name", "TogMic: Toggle Mute")?;
        set_string(&schema, "command", &command)?;
        set_string(&schema, "binding", binding)?;
        paths.push(path);
    }

    let mut list = read_custom_keybindings();
    list.retain(|p| !p.starts_with(PATH_PREFIX));
    list.extend(paths);
    write_custom_keybindings(&list)
}

/// Remove every keybinding we own, leaving the user's own entries untouched.
pub fn unregister() -> Result<(), String> {
    remove_our_entries()
}

fn remove_our_entries() -> Result<(), String> {
    let mut list = read_custom_keybindings();
    let ours: Vec<String> = list
        .iter()
        .filter(|p| p.starts_with(PATH_PREFIX))
        .cloned()
        .collect();

    if ours.is_empty() {
        return Ok(());
    }

    list.retain(|p| !p.starts_with(PATH_PREFIX));
    write_custom_keybindings(&list)?;

    // Clearing the keys themselves keeps dconf from accumulating dead entries.
    for path in ours {
        let schema = format!("{}:{}", CUSTOM_SCHEMA, path);
        for key in ["name", "command", "binding"] {
            let _ = Command::new("gsettings")
                .args(["reset", &schema, key])
                .output();
        }
    }
    Ok(())
}

fn read_custom_keybindings() -> Vec<String> {
    let output = match Command::new("gsettings")
        .args(["get", MEDIA_KEYS_SCHEMA, "custom-keybindings"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    // The value comes back as a GVariant literal: "@as []" when empty, otherwise "['/a/', '/b/']".
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches("@as")
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|s| s.trim().trim_matches('\'').trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn write_custom_keybindings(paths: &[String]) -> Result<(), String> {
    let value = format!(
        "[{}]",
        paths
            .iter()
            .map(|p| format!("'{}'", p))
            .collect::<Vec<_>>()
            .join(", ")
    );
    set(MEDIA_KEYS_SCHEMA, "custom-keybindings", &value)
}

/// `gsettings set` parses its argument as a GVariant literal, so a string value has to arrive
/// single-quoted and escaped — passing raw text works only by accident for values without quotes.
fn set_string(schema: &str, key: &str, value: &str) -> Result<(), String> {
    let escaped = value.replace('\\', "\\\\").replace('\'', "\\'");
    set(schema, key, &format!("'{}'", escaped))
}

fn set(schema: &str, key: &str, value: &str) -> Result<(), String> {
    let output = Command::new("gsettings")
        .args(["set", schema, key, value])
        .output()
        .map_err(|e| format!("Failed to run gsettings: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "gsettings set {} {} failed: {}",
            schema,
            key,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_bare_function_key() {
        assert_eq!(to_gnome_accelerator("F10").as_deref(), Some("F10"));
    }

    #[test]
    fn maps_modifiers() {
        assert_eq!(
            to_gnome_accelerator("CommandOrControl+Shift+F10").as_deref(),
            Some("<Control><Shift>F10")
        );
        assert_eq!(
            to_gnome_accelerator("Alt+M").as_deref(),
            Some("<Alt>m")
        );
    }

    #[test]
    fn maps_named_keys() {
        assert_eq!(
            to_gnome_accelerator("CommandOrControl+Space").as_deref(),
            Some("<Control>space")
        );
        assert_eq!(
            to_gnome_accelerator("Alt+ArrowUp").as_deref(),
            Some("<Alt>Up")
        );
    }

    #[test]
    fn rejects_unmappable_key() {
        assert!(to_gnome_accelerator("Ctrl+SomeNonsense").is_none());
    }

    /// Touches the real dconf database, so it only runs when asked for by name.
    /// Restores the previous state on the way out.
    #[test]
    #[ignore]
    fn gsettings_roundtrip() {
        // A running TogMic owns the same path prefix, so only the user's own entries are
        // expected to survive this test untouched.
        let before: Vec<String> = read_custom_keybindings()
            .into_iter()
            .filter(|p| !p.starts_with(PATH_PREFIX))
            .collect();

        register("F10", false).expect("register failed");
        let after = read_custom_keybindings();
        let ours: Vec<_> = after.iter().filter(|p| p.starts_with(PATH_PREFIX)).collect();
        assert_eq!(ours.len(), 1, "expected exactly one entry, got {:?}", after);

        let schema = format!("{}:{}0/", CUSTOM_SCHEMA, PATH_PREFIX);
        let binding = Command::new("gsettings")
            .args(["get", &schema, "binding"])
            .output()
            .expect("gsettings get failed");
        assert_eq!(
            String::from_utf8_lossy(&binding.stdout).trim(),
            "'F10'",
            "GNOME did not store the accelerator verbatim"
        );

        unregister().expect("unregister failed");
        assert_eq!(read_custom_keybindings(), before, "state not restored");
    }
}
