import { useApp } from "@/contexts/AppContext";
import type { HotkeyProfile } from "@/contexts/AppContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Play, Edit, Trash2, MicOff } from "lucide-react";

interface ProfileCardProps {
  profile: HotkeyProfile;
  isActive: boolean;
  onEdit: () => void;
}

export function ProfileCard({ profile, isActive, onEdit }: ProfileCardProps) {
  const { setActiveProfile, deleteProfile, devices } = useApp();

  const handleActivate = async () => {
    try {
      await setActiveProfile(profile);
    } catch (error) {
      console.error("Failed to activate profile:", error);
      alert("Failed to activate profile. The hotkey might already be in use.");
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete profile "${profile.name}"?`)) {
      try {
        await deleteProfile(profile.id);
      } catch (error) {
        console.error("Failed to delete profile:", error);
      }
    }
  };

  const getDeviceNames = () => {
    return profile.device_ids
      .map((id) => devices.find((d) => d.id === id)?.name || "Unknown Device")
      .join(", ");
  };

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-lg",
        isActive && "border-primary border-2 shadow-md",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{profile.name}</CardTitle>
          {isActive && <Badge>ACTIVE</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Hotkey</p>
          <Badge variant="secondary" className="font-mono">
            {profile.toggle_key}
          </Badge>
        </div>

        <Separator />

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Devices</p>
          <p className="text-sm">{getDeviceNames()}</p>
        </div>

        {profile.start_muted && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MicOff className="h-4 w-4" />
              <span>Starts muted</span>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {!isActive && (
          <Button onClick={handleActivate} className="flex-1" size="sm">
            <Play className="h-4 w-4 mr-1" />
            Activate
          </Button>
        )}
        <Button onClick={onEdit} variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
        <Button onClick={handleDelete} variant="destructive" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
