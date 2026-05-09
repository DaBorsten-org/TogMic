import { useApp } from "@/contexts/useApp";
import { useMuteState } from "@/contexts/useMuteState";
import { MuteIndicator } from "@/components/MuteIndicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCallback, useMemo } from "react";
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
  const { activeProfile, devices } = useApp();
  const { isMuted } = useMuteState();

  const defaultDeviceId = "default-mic";
  const allDevicesId = "all-mics";

  const resolveDeviceLabel = useCallback((deviceId: string) => {
    if (deviceId === defaultDeviceId) return t("defaultDevice");
    if (deviceId === allDevicesId) return t("allDevices");
    return devices.find((device) => device.id === deviceId)?.name ?? t("unknownDevice");
  }, [devices, t]);

  const deviceCount = useMemo(() =>
    (activeProfile?.deviceIds.length ?? 0) > 1 || activeProfile?.deviceIds.includes(allDevicesId)
      ? devices.length
      : activeProfile?.deviceIds.length ?? 0,
  [activeProfile, devices]);

  const displayDeviceIds = useMemo(() =>
    (activeProfile?.deviceIds.length ?? 0) > 1 || activeProfile?.deviceIds.includes(allDevicesId)
      ? [allDevicesId]
      : (activeProfile?.deviceIds ?? []),
  [activeProfile]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
          Overview · 1 of 1
        </p>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-foreground">
          {t("dashboard")}<span className="text-primary">.</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("dashboardSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Mute state card */}
        <Card
          className={cn(
            "flex items-center justify-center border transition-colors duration-300 overflow-hidden",
            !activeProfile && "border-border",
            activeProfile && isMuted && "border-neutral-400/30",
            activeProfile && !isMuted && "border-primary/30",
          )}
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <CardContent className="py-14">
            <MuteIndicator />
          </CardContent>
        </Card>

        {/* Active profile card */}
        <Card className="border" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] font-normal text-muted-foreground uppercase tracking-[0.2em]">
              {t("activeProfile")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeProfile ? (
              <div className="space-y-4">
                <p className="font-serif text-3xl font-normal leading-tight">{activeProfile.name}</p>

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
                        <Badge key={id} variant="secondary" className="text-xs"
                          style={{ boxShadow: "var(--shadow-btn)" }}>
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
