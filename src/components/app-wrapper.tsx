import { useState, useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProfilesPage } from "@/pages/profiles/ProfilesPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppProvider } from "@/contexts/AppContent";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MuteContext } from "@/contexts/MuteContext";
import { AppContext } from "@/contexts/AppContext";
import { MicIcon, MicOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Page = "dashboard" | "profiles" | "settings";

function HeaderMuteChip() {
  const { isMuted, toggleMute } = useContext(MuteContext);
  const { activeProfile } = useContext(AppContext);

  if (!activeProfile) return null;

  const isLive = !isMuted;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => toggleMute()}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-mono font-semibold tracking-widest uppercase transition-all duration-150 cursor-pointer",
          "active:translate-y-px",
          isLive
            ? "border-primary/60 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border bg-card text-muted-foreground hover:bg-muted"
        )}
        style={{
          boxShadow: isLive
            ? "var(--shadow-btn), 0 0 12px -2px color-mix(in oklch, var(--color-primary) 30%, transparent)"
            : "var(--shadow-btn)",
        }}
      >
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            isLive ? "bg-primary" : "bg-muted-foreground/50"
          )}
          style={{
            animation: isLive ? "tog-pulse 1.4s infinite" : "none",
            boxShadow: isLive ? "0 0 0 3px color-mix(in oklch, var(--color-primary) 20%, transparent)" : "none",
          }}
        />
        {isLive ? "Mic Live" : "Muted"}
      </button>
      <kbd
        className="inline-flex items-center rounded-md border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground/70 select-none"
        style={{ boxShadow: "var(--shadow-kbd)" }}
      >
        {activeProfile.toggleKey}
      </kbd>
    </div>
  );
}


export function AppWrapper() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; body?: string; date?: string } | undefined>(undefined);
  const [triggerInstallDialog, setTriggerInstallDialog] = useState(false);
  const { t } = useTranslation();

  const handleNavigateToUpdates = useCallback((version: string, body?: string, date?: string) => {
    setCurrentPage("settings");
    setSettingsInitialTab("updates");
    setAvailableUpdate({ version, body, date });
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />;
      case "profiles":
        return <ProfilesPage />;
      case "settings":
        return <SettingsPage initialTab={settingsInitialTab} availableUpdate={availableUpdate} onUpdateFound={setAvailableUpdate} triggerInstallDialog={triggerInstallDialog} onInstallDialogTriggered={() => setTriggerInstallDialog(false)} />;
      default:
        return <DashboardPage />;
    }
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case "dashboard":
        return t("dashboard");
      case "profiles":
        return t("profiles");
      case "settings":
        return t("settings");
      default:
        return t("dashboard");
    }
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Toaster />
      <AppProvider onNavigateToUpdates={handleNavigateToUpdates} onRequestInstall={() => { setCurrentPage("settings"); setSettingsInitialTab("updates"); setTriggerInstallDialog(true); }}>
        <SidebarProvider className="h-svh">
          <AppSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <SidebarInset className="overflow-hidden flex flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">TogMic</span>
                <span className="text-muted-foreground/30 text-[10px]">/</span>
                <span className="font-mono text-[10px] tracking-widest uppercase font-semibold">{getPageTitle()}</span>
              </div>
              <div className="flex-1" />
              <HeaderMuteChip />
            </header>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 pt-8">
                {renderPage()}
              </div>
            </ScrollArea>
          </SidebarInset>
        </SidebarProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
