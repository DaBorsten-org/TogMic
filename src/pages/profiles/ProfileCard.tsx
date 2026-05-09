import { useApp } from "@/contexts/useApp";
import type { HotkeyProfile } from "@/contexts/AppContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Play, Square, Edit, Trash2 } from "lucide-react";
import { memo, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ProfileCardProps {
  profile: HotkeyProfile;
  isActive: boolean;
  onEdit: () => void;
}

const KEY_LABELS: Record<string, string> = {
  CommandOrControl: "Ctrl",
  Control: "Ctrl",
  Meta: "⌘",
  Shift: "⇧",
  Alt: "Alt",
};

const formatKey = (key: string) => KEY_LABELS[key] ?? key;

export const ProfileCard = memo(function ProfileCard({ profile, isActive, onEdit }: ProfileCardProps) {
  const { t } = useTranslation();
  const { setActiveProfile, deactivateProfile, deleteProfile, devices } = useApp();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const defaultDeviceId = "default-mic";
  const allDevicesId = "all-mics";

  const handleActivate = useCallback(async () => {
    try {
      await setActiveProfile(profile);
    } catch (error) {
      console.error("Failed to activate profile:", error);
      setActivateError(t("activateProfileError"));
    }
  }, [setActiveProfile, profile, t]);

  const handleDeactivate = useCallback(async () => {
    try {
      await deactivateProfile();
    } catch (error) {
      console.error("Failed to deactivate profile:", error);
    }
  }, [deactivateProfile]);

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await deleteProfile(profile.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete profile:", error);
    }
  }, [deleteProfile, profile.id]);

  const deviceNames = useMemo(() => {
    if (profile.deviceIds.length > 1 || profile.deviceIds.includes(allDevicesId)) {
      return t("allDevices");
    }

    return profile.deviceIds
      .map((id) => {
        if (id === defaultDeviceId) return t("defaultDevice");
        if (id === allDevicesId) return t("allDevices");
        return devices.find((d) => d.id === id)?.name || t("unknownDevice");
      })
      .join(", ");
  }, [profile.deviceIds, devices, t]);

  return (
    <Card
      className={cn(
        "relative flex flex-col border transition-all duration-200 overflow-hidden",
        isActive ? "border-primary/60" : "border-border",
      )}
      style={{
        boxShadow: isActive ? "var(--shadow-card-deep)" : "var(--shadow-card)",
      }}
    >
      {/* corner swatch */}
      <div
        className={cn(
          "absolute top-0 right-0 w-12 h-12 rounded-bl-2xl opacity-80",
          isActive ? "bg-primary" : "bg-muted-foreground/20",
        )}
      />

      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
              {isActive ? t("activeBadge") : "Profile"}
            </p>
            <CardTitle className="font-serif text-2xl font-normal leading-tight">{profile.name}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">{t("hotkey")}</p>
          <KbdGroup className="flex-wrap justify-end">
            {profile.toggleKey.split("+").map((key, i, arr) => (
              <span key={key} className="inline-flex items-center gap-1">
                <Kbd>{formatKey(key)}</Kbd>
                {i < arr.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
              </span>
            ))}
          </KbdGroup>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground shrink-0">{t("devices")}</p>
          <p className="text-xs text-right">{deviceNames}</p>
        </div>
      </CardContent>

      <CardFooter className="@container flex gap-2 pt-2 mt-auto">
        {isActive ? (
          <Button
            onClick={handleDeactivate}
            variant="secondary"
            className="flex-1"
            style={{ boxShadow: "var(--shadow-btn)" }}
          >
            <Square className="h-4 w-4" />
            <span className="hidden @[14rem]:inline">{t("deactivate")}</span>
          </Button>
        ) : (
          <Button
            onClick={handleActivate}
            className="flex-1"
            style={{ boxShadow: "var(--shadow-btn)" }}
          >
            <Play className="h-4 w-4" />
            <span className="hidden @[14rem]:inline">{t("activate")}</span>
          </Button>
        )}
        <Button onClick={onEdit} variant="outline" size="icon" style={{ boxShadow: "var(--shadow-btn)" }}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button onClick={handleDelete} variant="destructive" size="icon" className="border border-destructive/60" style={{ boxShadow: "var(--shadow-btn)" }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>

      <ConfirmDialog
        open={showDeleteDialog}
        title={t("deleteProfile")}
        description={t("deleteProfileConfirm", { name: profile.name })}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        isDangerous={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmDialog
        open={activateError !== null}
        title={t("error")}
        description={activateError ?? ""}
        confirmText={t("ok")}
        showCancel={false}
        onConfirm={() => setActivateError(null)}
        onCancel={() => setActivateError(null)}
      />
    </Card>
  );
});
