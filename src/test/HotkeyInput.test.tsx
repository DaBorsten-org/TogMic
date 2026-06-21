import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { HotkeyInput } from "@/components/HotkeyInput";

// Keep tests focused on key-parsing logic, not the UI library
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => React.createElement("input", props),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

function setup(onChange = vi.fn()) {
  const { getByRole } = render(<HotkeyInput value="" onChange={onChange} />);
  const input = getByRole("textbox");
  fireEvent.focus(input);
  return { input, onChange };
}

describe("HotkeyInput key parsing", () => {
  it("records Ctrl+A as CommandOrControl+A", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "a", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+A");
  });

  it("records Meta+A as CommandOrControl+A", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "a", metaKey: true });
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+A");
  });

  it("records Ctrl+Shift+A", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "a", ctrlKey: true, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+Shift+A");
  });

  it("records Ctrl+Space", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+Space");
  });

  it("records F5 without modifier", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "F5" });
    expect(onChange).toHaveBeenCalledWith("F5");
  });

  it("falls back to e.code for F-keys when e.key is unexpected", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "Dead", code: "F6" });
    expect(onChange).toHaveBeenCalledWith("F6");
  });

  it("ignores solo modifier key", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "Control", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores plain char without modifier (requires modifier or F-key)", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops recording after a valid hotkey is captured", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "F5" });
    fireEvent.keyDown(input, { key: "F6" }); // second key — no longer recording
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
