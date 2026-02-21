"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { Page } from "@/components/app-wrapper";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  MicIcon,
  SettingsIcon,
  LayoutDashboardIcon,
  User2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export function AppSidebar({ currentPage, onNavigate, ...props }: AppSidebarProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const menuItems = [
    {
      title: t("dashboard"),
      page: "dashboard" as Page,
      icon: LayoutDashboardIcon,
    },
    {
      title: t("profiles"),
      page: "profiles" as Page,
      icon: User2Icon,
    },
    {
      title: t("settings"),
      page: "settings" as Page,
      icon: SettingsIcon,
    },
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => onNavigate("dashboard")}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground dark:bg-white dark:text-neutral-900 flex aspect-square size-8 items-center justify-center rounded-lg">
                <MicIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">TogMic</span>
                {version && (
                  <span className="truncate text-xs text-muted-foreground">v{version}</span>
                )}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton
                    size="lg"
                    onClick={() => onNavigate(item.page)}
                    isActive={currentPage === item.page}
                  >
                    <item.icon className="size-5" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
