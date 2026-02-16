import { useApp } from "@/contexts/AppContent";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";
import type { HotkeyProfile } from "@/contexts/AppContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Plus } from "lucide-react";
import { useState } from "react";

export function ProfilesPage() {
  const { profiles, activeProfile, refreshDevices } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HotkeyProfile | null>(null);

  const handleNewProfile = () => {
    setEditingProfile(null);
    setShowEditor(true);
  };

  const handleEditProfile = (profile: HotkeyProfile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingProfile(null);
  };

  const handleRefreshDevices = async () => {
    await refreshDevices();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profiles</h1>
        <p className="text-muted-foreground mt-1">Manage your microphone control profiles</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Profile</CardTitle>
              <CardDescription>Currently active microphone profile</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeProfile ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Profile Name</p>
              <h3 className="text-2xl font-semibold">{activeProfile.name}</h3>
              <p className="text-sm text-muted-foreground mt-4">Toggle Hotkey</p>
              <code className="text-sm bg-muted px-2 py-1 rounded">{activeProfile.toggle_key}</code>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No active profile. Select a profile to activate it.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Profiles</CardTitle>
              <CardDescription>Create and manage your profiles</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleRefreshDevices} 
                variant="outline" 
                size="sm"
                title="Refresh audio devices"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleNewProfile} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Profile
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {profiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No profiles yet. Create your first profile to control your microphone with hotkeys!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map(profile => (
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
        profile={editingProfile}
        onSave={handleCloseEditor}
        onCancel={handleCloseEditor}
        open={showEditor}
      />
    </div>
  );
}
