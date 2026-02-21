import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProfilesPage } from "@/pages/profiles/ProfilesPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppProvider } from "@/contexts/AppContent";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export type Page = "dashboard" | "profiles" | "settings";

export function AppWrapper() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const { t } = useTranslation();

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />;
      case "profiles":
        return <ProfilesPage />;
      case "settings":
        return <SettingsPage />;
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
      <AppProvider>
        <SidebarProvider>
          <AppSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <div className="mr-2 h-4 w-px bg-border" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage>{getPageTitle()}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-6 p-6 pt-8">
              {renderPage()}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
