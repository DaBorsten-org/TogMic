import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { MuteIndicator } from "@/components/MuteIndicator";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileEditor } from "@/components/ProfileEditor";
import type { HotkeyProfile } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Plus } from "lucide-react";

function App() {
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
    <main className="container mx-auto p-6 space-y-6 max-w-7xl">
      <header className="text-center space-y-2 pb-6">
        <h1 className="text-4xl font-bold">🎤 TogMic</h1>
        <p className="text-lg text-muted-foreground">Microphone Control with Global Hotkeys</p>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <MuteIndicator />
          
          <Separator />
          
          {activeProfile && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Active Profile</p>
              <h3 className="text-xl font-semibold">{activeProfile.name}</h3>
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">Hotkey:</span>
                <Badge variant="secondary" className="font-mono">
                  {activeProfile.toggle_key}
                </Badge>
              </div>
            </div>
          )}
          
          {!activeProfile && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No active profile. Create a profile to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Profiles</CardTitle>
              <CardDescription>Manage your microphone control profiles</CardDescription>
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
    </main>
  );
}

export default App;

