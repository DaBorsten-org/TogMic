import { useApp } from "@/contexts/AppContent";
import type { HotkeyProfile } from "@/contexts/AppContent";
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
import { useState } from "react";
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

export function ProfileCard({ profile, isActive, onEdit }: ProfileCardProps) {
  const { t } = useTranslation();
  const { setActiveProfile, deactivateProfile, deleteProfile, devices } = useApp();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const defaultDeviceId = "default-mic";
  const allDevicesId = "all-mics";

  const handleActivate = async () => {
    try {
      await setActiveProfile(profile);
    } catch (error) {
      console.error("Failed to activate profile:", error);
      setActivateError(t("activateProfileError"));
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateProfile();
    } catch (error) {
      console.error("Failed to deactivate profile:", error);
    }
  };

  const handleDelete = async () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteProfile(profile.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete profile:", error);
    }
  };

  const getDeviceNames = () => {
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
  };

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-lg border-2 flex flex-col",
        isActive ? "border-primary shadow-md" : "border-border",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{profile.name}</CardTitle>
          {isActive && <Badge>{t("activeBadge")}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t("hotkey")}</p>
          <KbdGroup className="flex-wrap">
            {profile.toggleKey.split("+").map((key, i, arr) => (
              <span key={key} className="inline-flex items-center gap-1">
                <Kbd>{formatKey(key)}</Kbd>
                {i < arr.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
              </span>
            ))}
          </KbdGroup>
        </div>

        <Separator />

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t("devices")}</p>
          <p className="text-sm">{getDeviceNames()}</p>
        </div>
      </CardContent>

      <CardFooter className="@container flex gap-2 pt-2 mt-auto">
        {isActive ? (
          <Button onClick={handleDeactivate} variant="secondary" className="flex-1">
            <Square className="h-4 w-4" />
            <span className="hidden @[14rem]:inline">{t("deactivate")}</span>
          </Button>
        ) : (
          <Button onClick={handleActivate} className="flex-1">
            <Play className="h-4 w-4" />
            <span className="hidden @[14rem]:inline">{t("activate")}</span>
          </Button>
        )}
        <Button onClick={onEdit} variant="outline" size="icon">
          <Edit className="h-4 w-4" />
        </Button>
        <Button onClick={handleDelete} variant="destructive" size="icon">
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
}
