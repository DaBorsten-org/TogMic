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
import { Sun, Moon, Monitor, Download } from "lucide-react";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useApp();
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  
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

  const handleAutostartChange = async (checked: boolean) => {
    try {
      await updateSettings({ autostart: checked });
    } catch (error) {
      console.error("Failed to update autostart setting:", error);
      alert("Failed to update autostart setting. Please try again.");
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
    setUpdateStatus("Checking for updates...");
    
    try {
      const update = await check();
      
      if (update) {
        setUpdateStatus(`New version available: ${update.version}`);
        
        if (confirm(`Update to version ${update.version}?\n\nRelease notes:\n${update.body || 'No release notes available'}`)) {
          setUpdateStatus("Downloading update...");
          await update.downloadAndInstall();
          setUpdateStatus("Update installed! Relaunching...");
          await relaunch();
        }
      } else {
        setUpdateStatus("You are on the latest version!");
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateStatus("Failed to check for updates");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("settings")}</h1>
        <p className="text-muted-foreground mt-1">Configure your application preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred color theme</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              <Button 
                onClick={() => setTheme("light")}
                variant={theme === "light" ? "default" : "outline"}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" />
                Light
              </Button>
              <Button 
                onClick={() => setTheme("dark")}
                variant={theme === "dark" ? "default" : "outline"}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" />
                Dark
              </Button>
              <Button 
                onClick={() => setTheme("system")}
                variant={theme === "system" ? "default" : "outline"}
                className="flex-1"
              >
                <Monitor className="h-4 w-4 mr-2" />
                System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application Behavior</CardTitle>
          <CardDescription>Configure how the application behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-muted" className="text-base">
                Start Muted
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically mute microphone when app starts
              </p>
            </div>
            <Switch
              id="start-muted"
              checked={settings.startMuted}
              onCheckedChange={handleStartMutedChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autostart" className="text-base">
                Start with Windows
              </Label>
              <p className="text-sm text-muted-foreground">
                Launch TogMic automatically when you log in
              </p>
            </div>
            <Switch
              id="autostart"
              checked={settings.autostart}
              onCheckedChange={handleAutostartChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="check-updates" className="text-base">
                Check for Updates
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically check for new versions
              </p>
            </div>
            <Switch
              id="check-updates"
              checked={settings.checkUpdates}
              onCheckedChange={handleCheckUpdatesChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="close-to-tray" className="text-base">
                {t("closeToTray", "Close to System Tray")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("closeToTrayDescription", "Minimize to system tray instead of quitting when closing the window")}
              </p>
            </div>
            <Switch
              id="close-to-tray"
              checked={settings.closeToTray}
              onCheckedChange={handleCloseToTrayChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>Check for application updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdate}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {isCheckingUpdate ? "Checking..." : "Check for Updates"}
          </Button>
          {updateStatus && (
            <p className="text-sm text-muted-foreground text-center">
              {updateStatus}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Choose your preferred language</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Language</Label>
            <div className="flex gap-2">
              <Button 
                onClick={() => changeLanguage("en")}
                variant={i18n.language === "en" ? "default" : "outline"}
              >
                English
              </Button>
              <Button 
                onClick={() => changeLanguage("de")}
                variant={i18n.language === "de" ? "default" : "outline"}
              >
                Deutsch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
