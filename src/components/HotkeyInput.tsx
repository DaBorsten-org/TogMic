import { useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface HotkeyInputProps {
  value: string;
  onChange: (hotkey: string) => void;
  placeholder?: string;
}

export function HotkeyInput({
  value,
  onChange,
  placeholder,
}: HotkeyInputProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKey, setRecordedKey] = useState<string | null>(null);

  const displayValue = isRecording
    ? (recordedKey ?? t("hotkeyPressKeys"))
    : (value || "");

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];

    // Add modifiers (using CommandOrControl for cross-platform compatibility)
    if (e.ctrlKey || e.metaKey) keys.push("CommandOrControl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");

    // Add the main key if it's not a modifier
    if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      const key = e.key;

      // Handle F keys (F1-F24) - try e.key first, fall back to e.code
      const fKeyMatch = key.match(/^F([1-9]|1[0-9]|2[0-4])$/);
      const codeMatch = e.code.match(/^F([1-9]|1[0-9]|2[0-4])$/);

      if (fKeyMatch) {
        keys.push(key);
      }
      // Fallback to e.code for F-keys (handles cases where e.key doesn't report F-key properly)
      else if (codeMatch) {
        keys.push(e.code);
      }
      // Convert special keys
      else if (key === " ") {
        keys.push("Space");
      }
      // Single character keys
      else if (key.length === 1) {
        keys.push(key.toUpperCase());
      }
      // Other special keys (Arrow keys, etc.)
      else {
        keys.push(key);
      }
    }

    // Allow single F-keys without modifiers, or any key with modifiers
    if (keys.length >= 1 && (keys[0].startsWith("F") || keys.length > 1)) {
      const hotkey = keys.join("+");
      setRecordedKey(hotkey);
      onChange(hotkey);
      setIsRecording(false);
    }
  }, [isRecording, onChange]);

  const handleFocus = useCallback(() => {
    setRecordedKey(null);
    setIsRecording(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsRecording(false);
    setRecordedKey(null);
  }, []);

  return (
    <Input
      type="text"
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || t("hotkeyClickToRecord")}
      readOnly
      className={cn(
        "font-mono cursor-pointer",
        isRecording && "ring-2 ring-primary animate-pulse",
      )}
    />
  );
}
