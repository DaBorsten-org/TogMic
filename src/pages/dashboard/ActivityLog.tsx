import { Mic, MicOff } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMuteState } from "@/contexts/useMuteState";
import { cn } from "@/lib/utils";

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export function ActivityLog({
  resolveDeviceLabel,
}: {
  resolveDeviceLabel: (deviceId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const { activity, clearActivity } = useMuteState();

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [i18n.language],
  );
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: "2-digit",
        month: "2-digit",
      }),
    [i18n.language],
  );
  const today = new Date().toDateString();

  return (
    <Card
      className="border gap-2 opacity-0 translate-y-2"
      style={{
        boxShadow: "var(--shadow-card)",
        animation: "tog-enter 320ms cubic-bezier(0.23,1,0.32,1) 180ms forwards",
      }}
    >
      <CardHeader className="flex h-8 flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t("activityLog")}
        </CardTitle>
        {activity.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearActivity}>
            {t("activityClear")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="h-56">
        {activity.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <div className="space-y-1">
              <p>{t("activityEmpty")}</p>
              <p className="text-sm">{t("activityEmptyHint")}</p>
            </div>
          </div>
        ) : (
          <ul className="h-full overflow-y-auto -mr-2 pr-2 divide-y divide-border">
            {activity.map((entry, i) => {
              // Entries are newest-first, so the previous one marks when this state ended
              const endedAt = i > 0 ? activity[i - 1].timestamp : null;
              const Icon = entry.muted ? MicOff : Mic;
              return (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
                    {/* Restored entries can be from earlier days */}
                    {new Date(entry.timestamp).toDateString() !== today &&
                      `${dateFormat.format(entry.timestamp)} `}
                    {timeFormat.format(entry.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full shrink-0",
                      entry.muted
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/15 text-primary",
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight">
                      {entry.muted ? t("activityMuted") : t("activityUnmuted")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        entry.profileName,
                        entry.deviceIds.map(resolveDeviceLabel).join(", "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {endedAt !== null && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
                      {formatDuration(endedAt - entry.timestamp)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
