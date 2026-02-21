import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { devices, saveProfile, refreshDevices } = useApp();

  const defaultDeviceId = "default-mic";
  const allDevicesId = "all-mics";

  const [name, setName] = useState(profile?.name || "");
  const [toggleKey, setToggleKey] = useState(profile?.toggleKey || "");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    if (!profile?.deviceIds || profile.deviceIds.length === 0) {
      return defaultDeviceId;
    }

    if (profile.deviceIds.length > 1) {
      return allDevicesId;
    }

    return profile.deviceIds[0];
  });
  const [ignoreModifiers, setIgnoreModifiers] = useState(profile?.ignoreModifiers ?? false);
  const [error, setError] = useState("");
  const [dropdownKey, setDropdownKey] = useState(0);

  // Reset form fields when dialog opens or profile changes
  useEffect(() => {
    if (open) {
      setName(profile?.name || "");
      setToggleKey(profile?.toggleKey || "");
      setIgnoreModifiers(profile?.ignoreModifiers ?? false);

      if (!profile?.deviceIds || profile.deviceIds.length === 0) {
        setSelectedDeviceId(defaultDeviceId);
      } else if (profile.deviceIds.length > 1) {
        setSelectedDeviceId(allDevicesId);
      } else {
        setSelectedDeviceId(profile.deviceIds[0]);
      }

      setError("");
    }
  }, [open, profile]);

  const resolveDeviceLabel = (deviceId: string) => {
    if (deviceId === defaultDeviceId) return t("defaultDevice");
    if (deviceId === allDevicesId) return t("allDevices");
    const device = devices.find((entry) => entry.id === deviceId);
    return device?.name ?? t("unknownDevice");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError(t("profileNameRequired"));
      return;
    }

    if (!toggleKey) {
      setError(t("hotkeyRequired"));
      return;
    }

    if (!selectedDeviceId) {
      setError(t("deviceRequired"));
      return;
    }

    try {
      const newProfile: HotkeyProfile = {
        id: profile?.id || `profile-${Date.now()}`,
        name: name.trim(),
        toggleKey: toggleKey,
        deviceIds: [selectedDeviceId],
        ignoreModifiers,
      };

      await saveProfile(newProfile);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"));
    }
  };

  const handleDropdownOpenChange = async (isOpen: boolean) => {
    if (isOpen) {
      await refreshDevices();
      // Force dropdown content to re-render by changing key
      setDropdownKey(prev => prev + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{profile ? t("editProfile") : t("newProfile")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("profileName")}</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profileNamePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotkey">{t("hotkey")}</Label>
            <HotkeyInput value={toggleKey} onChange={setToggleKey} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ignore-modifiers" className="text-sm font-medium">{t("ignoreModifiers")}</Label>
              <p className="text-xs text-muted-foreground">{t("ignoreModifiersDesc")}</p>
            </div>
            <Switch
              id="ignore-modifiers"
              checked={ignoreModifiers}
              onCheckedChange={setIgnoreModifiers}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("devices")}</Label>
            <DropdownMenu onOpenChange={handleDropdownOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <span className="truncate">{resolveDeviceLabel(selectedDeviceId)}</span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent key={dropdownKey} className="max-h-64">
                <DropdownMenuRadioGroup
                  value={selectedDeviceId}
                  onValueChange={setSelectedDeviceId}
                >
                  <DropdownMenuRadioItem value={defaultDeviceId}>
                    {t("defaultDevice")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={allDevicesId}>
                    {t("allDevices")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  {devices.length === 0 ? (
                    <DropdownMenuItem disabled>
                      {t("noAudioDevices")}
                    </DropdownMenuItem>
                  ) : (
                    devices.map((device) => (
                      <DropdownMenuRadioItem key={device.id} value={device.id}>
                        <span className="flex items-center gap-2">
                          {device.name}
                          {device.isDefault && (
                            <Badge variant="secondary">{t("defaultDevice")}</Badge>
                          )}
                        </span>
                      </DropdownMenuRadioItem>
                    ))
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("saveProfile")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
