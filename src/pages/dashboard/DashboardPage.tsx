import { useApp } from "@/contexts/AppContent";
import { MuteIndicator } from "@/components/MuteIndicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const KEY_LABELS: Record<string, string> = {
  CommandOrControl: "Ctrl",
  Control: "Ctrl",
  Meta: "⌘",
  Shift: "⇧",
  Alt: "Alt",
};
const formatKey = (key: string) => KEY_LABELS[key] ?? key;

export function DashboardPage() {
  const { t } = useTranslation();
  const { activeProfile, devices, isMuted } = useApp();

  const defaultDeviceId = "default-mic";
  const allDevicesId = "all-mics";

  const resolveDeviceLabel = (deviceId: string) => {
    if (deviceId === defaultDeviceId) return t("defaultDevice");
    if (deviceId === allDevicesId) return t("allDevices");
    return devices.find((device) => device.id === deviceId)?.name ?? t("unknownDevice");
  };

  const deviceCount =
    (activeProfile?.deviceIds.length ?? 0) > 1 || activeProfile?.deviceIds.includes(allDevicesId)
      ? devices.length
      : activeProfile?.deviceIds.length ?? 0;

  const displayDeviceIds =
    (activeProfile?.deviceIds.length ?? 0) > 1 || activeProfile?.deviceIds.includes(allDevicesId)
      ? [allDevicesId]
      : (activeProfile?.deviceIds ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("dashboard")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboardSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mute state card — tinted based on current state */}
        <Card
          className={cn(
            "flex items-center justify-center border-2 transition-colors duration-300",
            !activeProfile && "border-border",
            activeProfile && isMuted && "border-red-500/40 bg-red-500/5",
            activeProfile && !isMuted && "border-green-500/40 bg-green-500/5",
          )}
        >
          <CardContent className="py-12">
            <MuteIndicator />
          </CardContent>
        </Card>

        {/* Active profile card */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("activeProfile")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeProfile ? (
              <div className="space-y-4">
                <p className="text-2xl font-bold leading-tight">{activeProfile.name}</p>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground shrink-0">{t("hotkey")}</span>
                    <KbdGroup className="flex-wrap justify-end">
                      {activeProfile.toggleKey.split("+").map((key, i, arr) => (
                        <span key={key} className="inline-flex items-center gap-1">
                          <Kbd>{formatKey(key)}</Kbd>
                          {i < arr.length - 1 && (
                            <span className="text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </KbdGroup>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground shrink-0">
                      {t("devicesCount", { count: deviceCount })}
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {displayDeviceIds.map((id) => (
                        <Badge key={id} variant="secondary" className="text-xs">
                          {resolveDeviceLabel(id)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <div className="text-center space-y-2">
                  <p>{t("noActiveProfile")}</p>
                  <p className="text-sm">{t("noActiveProfileHint")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
