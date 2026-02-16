import { useState } from "react";
import { useApp } from "@/contexts/AppContent";
import type { HotkeyProfile } from "@/contexts/AppContent";
import { HotkeyInput } from "@/components/HotkeyInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ProfileEditorProps {
  profile?: HotkeyProfile | null;
  onSave: () => void;
  onCancel: () => void;
  open: boolean;
}

export function ProfileEditor({
  profile,
  onSave,
  onCancel,
  open,
}: ProfileEditorProps) {
  const { devices, saveProfile } = useApp();

  const [name, setName] = useState(profile?.name || "");
  const [toggleKey, setToggleKey] = useState(profile?.toggle_key || "");
  const [selectedDevices, setSelectedDevices] = useState<string[]>(
    profile?.device_ids || [],
  );
  const [error, setError] = useState("");

  const handleDeviceToggle = (deviceId: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Profile name is required");
      return;
    }

    if (!toggleKey) {
      setError("Hotkey is required");
      return;
    }

    if (selectedDevices.length === 0) {
      setError("At least one device must be selected");
      return;
    }

    try {
      const newProfile: HotkeyProfile = {
        id: profile?.id || `profile-${Date.now()}`,
        name: name.trim(),
        toggle_key: toggleKey,
        device_ids: selectedDevices,
      };

      await saveProfile(newProfile);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit Profile" : "New Profile"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Profile Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Profile"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotkey">Hotkey</Label>
            <HotkeyInput value={toggleKey} onChange={setToggleKey} />
          </div>

          <div className="space-y-2">
            <Label>Devices</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No audio devices found
                </p>
              ) : (
                devices.map((device) => (
                  <div key={device.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={device.id}
                      checked={selectedDevices.includes(device.id)}
                      onCheckedChange={() => handleDeviceToggle(device.id)}
                    />
                    <Label
                      htmlFor={device.id}
                      className="flex-1 text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      {device.name}
                      {device.is_default && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save Profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
