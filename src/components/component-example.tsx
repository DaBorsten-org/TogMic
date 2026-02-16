import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppProvider } from "@/contexts/AppContent";
import { ThemeProvider } from "@/components/theme-provider";

export type Page = "dashboard" | "profiles" | "settings";

export function ComponentExample() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

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
        return "Dashboard";
      case "profiles":
        return "Profiles";
      case "settings":
        return "Settings";
      default:
        return "Dashboard";
    }
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppProvider>
        <SidebarProvider>
          <AppSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{getPageTitle()}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-6">
            {renderPage()}
          </div>
        </SidebarInset>
      </SidebarProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
