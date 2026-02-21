import { useState, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [isRecording, setIsRecording] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent) => {
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
      let key = e.key;

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
      setDisplayValue(hotkey);
      onChange(hotkey);
      setIsRecording(false);
    }
  };

  const handleFocus = () => {
    setIsRecording(true);
    setDisplayValue("Press keys...");
  };

  const handleBlur = () => {
    setIsRecording(false);
    setDisplayValue(value || "");
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || "Click to record hotkey"}
      readOnly
      className={cn(
        "font-mono cursor-pointer",
        isRecording && "ring-2 ring-primary animate-pulse",
      )}
    />
  );
}
