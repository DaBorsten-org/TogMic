import { useApp } from "@/contexts/useApp";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";
import type { HotkeyProfile } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RefreshCw, Plus } from "lucide-react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function ProfilesPage() {
  const { t } = useTranslation();
  const { profiles, activeProfile, refreshDevices } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HotkeyProfile | null>(
    null,
  );

  const handleNewProfile = useCallback(() => {
    setEditingProfile(null);
    setShowEditor(true);
  }, []);

  const handleEditProfile = useCallback((profile: HotkeyProfile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setShowEditor(false);
    setEditingProfile(null);
  }, []);

  const handleRefreshDevices = useCallback(async () => {
    try {
      await refreshDevices();
      toast.success(t("devicesRefreshed"));
    } catch {
      toast.error(t("devicesRefreshFailed"));
    }
  }, [refreshDevices, t]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("profiles")}</h1>
        <p className="text-muted-foreground mt-1">{t("profilesSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("yourProfiles")}</CardTitle>
              <CardDescription>{t("yourProfilesDesc")}</CardDescription>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleRefreshDevices}
                variant="outline"
                size="lg"
                title={t("refreshAudioDevices")}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("refresh")}
              </Button>
              <Button onClick={handleNewProfile} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                {t("newProfile")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {profiles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>{t("noProfilesYet")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={activeProfile?.id === profile.id}
                  onEdit={() => handleEditProfile(profile)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProfileEditor
        key={showEditor ? (editingProfile?.id ?? "new") : "closed"}
        profile={editingProfile}
        onSave={handleCloseEditor}
        onCancel={handleCloseEditor}
        open={showEditor}
      />
    </div>
  );
}
