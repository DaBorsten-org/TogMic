import { useApp } from '@/contexts/AppContent';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function MuteIndicator() {
  const { t } = useTranslation();
  const { isMuted, toggleMute, activeProfile } = useApp();
  const disabled = !activeProfile;

  const handleClick = () => {
    console.log('MuteIndicator button clicked');
    toggleMute();
  };

  return (
    <div className="flex justify-center">
      <Button
        size="lg"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          "h-48 w-48 rounded-full text-white shadow-lg transition-all",
          !disabled && "hover:scale-105",
          isMuted
            ? "bg-red-500 hover:bg-red-600"
            : "bg-green-500 hover:bg-green-600"
        )}
      >
        <div className="flex flex-col items-center gap-2">
          {isMuted ? (
            <MicOff className="size-8" />
          ) : (
            <Mic className="size-8" />
          )}
          <div className="text-xl font-bold">
            {disabled ? t("noProfile") : isMuted ? t("muted") : t("active")}
          </div>
        </div>
      </Button>
    </div>
  );
}
