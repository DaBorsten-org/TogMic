import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useApp } from "@/contexts/AppContent";
import { useState } from "react";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ThemePreview({ value }: { value: "light" | "dark" | "system" }) {
  if (value === "light") return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="120" height="80" fill="#f8fafc"/>
      <rect width="120" height="10" fill="#e2e8f0"/>
      <rect width="28" height="70" y="10" fill="#f1f5f9"/>
      <rect x="4" y="14" width="20" height="5" rx="2" fill="#94a3b8"/>
      <rect x="4" y="22" width="20" height="5" rx="2" fill="#cbd5e1"/>
      <rect x="4" y="30" width="20" height="5" rx="2" fill="#cbd5e1"/>
      <rect x="33" y="14" width="82" height="24" rx="3" fill="white" stroke="#e2e8f0" strokeWidth="1"/>
      <rect x="37" y="19" width="50" height="5" rx="2" fill="#e2e8f0"/>
      <rect x="37" y="27" width="35" height="4" rx="2" fill="#f1f5f9"/>
      <rect x="33" y="43" width="82" height="24" rx="3" fill="white" stroke="#e2e8f0" strokeWidth="1"/>
      <rect x="37" y="48" width="40" height="5" rx="2" fill="#e2e8f0"/>
      <rect x="37" y="56" width="55" height="4" rx="2" fill="#f1f5f9"/>
    </svg>
  );

  if (value === "dark") return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="120" height="80" fill="#09090b"/>
      <rect width="120" height="10" fill="#18181b"/>
      <rect width="28" height="70" y="10" fill="#18181b"/>
      <rect x="4" y="14" width="20" height="5" rx="2" fill="#52525b"/>
      <rect x="4" y="22" width="20" height="5" rx="2" fill="#27272a"/>
      <rect x="4" y="30" width="20" height="5" rx="2" fill="#27272a"/>
      <rect x="33" y="14" width="82" height="24" rx="3" fill="#18181b" stroke="#27272a" strokeWidth="1"/>
      <rect x="37" y="19" width="50" height="5" rx="2" fill="#3f3f46"/>
      <rect x="37" y="27" width="35" height="4" rx="2" fill="#27272a"/>
      <rect x="33" y="43" width="82" height="24" rx="3" fill="#18181b" stroke="#27272a" strokeWidth="1"/>
      <rect x="37" y="48" width="40" height="5" rx="2" fill="#3f3f46"/>
      <rect x="37" y="56" width="55" height="4" rx="2" fill="#27272a"/>
    </svg>
  );

  // System: left = light, right = dark
  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <defs>
        <clipPath id="theme-clip-left"><rect width="60" height="80"/></clipPath>
        <clipPath id="theme-clip-right"><rect x="60" width="60" height="80"/></clipPath>
      </defs>
      <g clipPath="url(#theme-clip-left)">
        <rect width="60" height="80" fill="#f8fafc"/>
        <rect width="60" height="10" fill="#e2e8f0"/>
        <rect width="28" height="70" y="10" fill="#f1f5f9"/>
        <rect x="4" y="14" width="20" height="5" rx="2" fill="#94a3b8"/>
        <rect x="4" y="22" width="20" height="5" rx="2" fill="#cbd5e1"/>
        <rect x="33" y="14" width="25" height="24" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="1"/>
        <rect x="36" y="19" width="18" height="4" rx="1" fill="#e2e8f0"/>
        <rect x="36" y="26" width="13" height="3" rx="1" fill="#f1f5f9"/>
        <rect x="33" y="43" width="25" height="24" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="1"/>
        <rect x="36" y="48" width="16" height="4" rx="1" fill="#e2e8f0"/>
      </g>
      <g clipPath="url(#theme-clip-right)">
        <rect x="60" width="60" height="80" fill="#09090b"/>
        <rect x="60" width="60" height="10" fill="#18181b"/>
        <rect x="63" y="14" width="52" height="24" rx="2" fill="#18181b" stroke="#27272a" strokeWidth="1"/>
        <rect x="66" y="19" width="40" height="4" rx="1" fill="#3f3f46"/>
        <rect x="66" y="26" width="30" height="3" rx="1" fill="#27272a"/>
        <rect x="63" y="43" width="52" height="24" rx="2" fill="#18181b" stroke="#27272a" strokeWidth="1"/>
        <rect x="66" y="48" width="35" height="4" rx="1" fill="#3f3f46"/>
      </g>
      <line x1="60" y1="0" x2="60" y2="80" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useApp();
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const handleStartMutedChange = async (checked: boolean) => {
    try {
      await updateSettings({ startMuted: checked });
    } catch (error) {
      console.error("Failed to update start muted setting:", error);
    }
  };

  const handleStartMinimizedChange = async (checked: boolean) => {
    try {
      await updateSettings({ startMinimized: checked });
    } catch (error) {
      console.error("Failed to update start minimized setting:", error);
    }
  };

  const handleAutostartChange = async (checked: boolean) => {
    try {
      await updateSettings({ autostart: checked });
    } catch (error) {
      console.error("Failed to update autostart setting:", error);
      setErrorMessage(t("autostartError"));
    }
  };

  const handleCheckUpdatesChange = async (checked: boolean) => {
    try {
      await updateSettings({ checkUpdates: checked });
    } catch (error) {
      console.error("Failed to update check updates setting:", error);
    }
  };

  const handleCloseToTrayChange = async (checked: boolean) => {
    try {
      await updateSettings({ closeToTray: checked });
    } catch (error) {
      console.error("Failed to update close to tray setting:", error);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(t("checkingForUpdates"));

    try {
      const update = await check();

      if (update) {
        setUpdateStatus(t("updateAvailable", { version: update.version }));
        setUpdateInfo({
          version: update.version,
          body: update.body || t("noReleaseNotes"),
        });
        setShowUpdateDialog(true);
      } else {
        setUpdateStatus(t("upToDate"));
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateStatus(t("failedToCheckUpdates"));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!updateInfo) return;

    try {
      const update = await check();
      if (update) {
        setUpdateStatus(t("downloadingUpdate"));
        await update.downloadAndInstall();
        setUpdateStatus(t("updateInstalled"));
        await relaunch();
      }
    } catch (error) {
      console.error("Failed to install update:", error);
      setUpdateStatus(t("failedToInstallUpdate"));
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{t("settings")}</h1>
        <p className="text-muted-foreground mt-1">{t("settingsSubtitle")}</p>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList className="w-full">
          <TabsTrigger value="appearance" className="flex-1">{t("appearance")}</TabsTrigger>
          <TabsTrigger value="behavior" className="flex-1">{t("behavior")}</TabsTrigger>
          <TabsTrigger value="updates" className="flex-1">{t("updates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("theme")}</CardTitle>
              <CardDescription>{t("appearanceDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {(["light", "dark", "system"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-2 rounded-xl border-2 p-1.5 pb-2.5 transition-all",
                      theme === value
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <div className="w-full overflow-hidden rounded-lg">
                      <ThemePreview value={value} />
                    </div>
                    <span className="text-xs font-medium">{t(value)}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("language")}</CardTitle>
              <CardDescription>{t("languageDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  onClick={() => changeLanguage("en")}
                  variant={i18n.language === "en" ? "default" : "outline"}
                  size="lg"
                  className="flex-1"
                >
                  {t("langEnglish")}
                </Button>
                <Button
                  onClick={() => changeLanguage("de")}
                  variant={i18n.language === "de" ? "default" : "outline"}
                  size="lg"
                  className="flex-1"
                >
                  {t("langGerman")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("appBehavior")}</CardTitle>
              <CardDescription>{t("appBehaviorDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 px-6">
              <div className="flex items-center justify-between py-4 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="start-muted" className="text-base font-medium">{t("startMuted")}</Label>
                  <p className="text-sm text-muted-foreground">{t("startMutedDesc")}</p>
                </div>
                <Switch id="start-muted" checked={settings.startMuted} onCheckedChange={handleStartMutedChange} />
              </div>

              <div className="flex items-center justify-between py-4 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="start-minimized" className="text-base font-medium">{t("startMinimized")}</Label>
                  <p className="text-sm text-muted-foreground">{t("startMinimizedDesc")}</p>
                </div>
                <Switch id="start-minimized" checked={settings.startMinimized} onCheckedChange={handleStartMinimizedChange} />
              </div>

              <div className="flex items-center justify-between py-4 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="autostart" className="text-base font-medium">{t("startWithWindows")}</Label>
                  <p className="text-sm text-muted-foreground">{t("startWithWindowsDesc")}</p>
                </div>
                <Switch id="autostart" checked={settings.autostart} onCheckedChange={handleAutostartChange} />
              </div>

              <div className="flex items-center justify-between py-4 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="check-updates" className="text-base font-medium">{t("checkForUpdates")}</Label>
                  <p className="text-sm text-muted-foreground">{t("checkForUpdatesDesc")}</p>
                </div>
                <Switch id="check-updates" checked={settings.checkUpdates} onCheckedChange={handleCheckUpdatesChange} />
              </div>

              <div className="flex items-center justify-between py-4">
                <div className="space-y-0.5">
                  <Label htmlFor="close-to-tray" className="text-base font-medium">{t("closeToTray")}</Label>
                  <p className="text-sm text-muted-foreground">{t("closeToTrayDescription")}</p>
                </div>
                <Switch id="close-to-tray" checked={settings.closeToTray} onCheckedChange={handleCloseToTrayChange} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("updates")}</CardTitle>
              <CardDescription>{t("updatesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleCheckForUpdates}
                disabled={isCheckingUpdate}
                size="lg"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                {isCheckingUpdate ? t("checking") : t("checkForUpdates")}
              </Button>
              {updateStatus && (
                <p className="text-sm text-muted-foreground text-center">{updateStatus}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={errorMessage !== null}
        title={t("error")}
        description={errorMessage ?? ""}
        confirmText={t("ok")}
        showCancel={false}
        onConfirm={() => setErrorMessage(null)}
        onCancel={() => setErrorMessage(null)}
      />

      {updateInfo && (
        <ConfirmDialog
          open={showUpdateDialog}
          title={t("updateToVersion", { version: updateInfo.version })}
          description={t("releaseNotes")}
          confirmText={t("update")}
          cancelText={t("cancel")}
          onConfirm={handleConfirmUpdate}
          onCancel={() => setShowUpdateDialog(false)}
        >
          <div className="max-h-48 overflow-y-auto rounded-md border border-muted bg-muted/50 p-4 text-sm whitespace-pre-wrap">
            {updateInfo.body}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
