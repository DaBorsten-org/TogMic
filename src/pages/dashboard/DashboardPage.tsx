import { useApp } from "@/contexts/AppContent";
import { MuteIndicator } from "@/components/MuteIndicator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DashboardPage() {
  const { activeProfile } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Quick access to microphone control</p>
      </div>

      <Card className="border-2">
        <CardContent className="pt-6">
          <MuteIndicator />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Profile</CardTitle>
          <CardDescription>Currently loaded profile configuration</CardDescription>
        </CardHeader>
        <CardContent>
          {activeProfile ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Profile Name</p>
                <h3 className="text-2xl font-semibold">{activeProfile.name}</h3>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Hotkey</p>
                <Badge variant="secondary" className="font-mono text-base px-3 py-1">
                  {activeProfile.toggle_key}
                </Badge>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Devices ({activeProfile.device_ids.length})</p>
                <div className="flex flex-wrap gap-2">
                  {activeProfile.device_ids.map((id, idx) => (
                    <Badge key={idx} variant="outline">
                      {id === "default-mic" ? "Default Microphone" : `Device ${idx + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No profile is currently active.</p>
              <p className="text-sm mt-2">Go to the Profiles page to create and activate a profile.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
