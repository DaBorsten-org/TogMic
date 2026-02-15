import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Mic, MicOff } from 'lucide-react';

export function MuteIndicator() {
  const { isMuted, toggleMute } = useApp();

  const handleClick = () => {
    console.log('MuteIndicator button clicked');
    toggleMute();
  };

  return (
    <div className="flex justify-center">
      <Button
        size="lg"
        onClick={handleClick}
        className={cn(
          "h-48 w-48 rounded-full text-white shadow-lg transition-all hover:scale-105",
          isMuted 
            ? "bg-red-500 hover:bg-red-600" 
            : "bg-green-500 hover:bg-green-600"
        )}
      >
        <div className="flex flex-col items-center gap-2">
          {isMuted ? (
            <MicOff className="h-16 w-16" />
          ) : (
            <Mic className="h-16 w-16" />
          )}
          <div className="text-xl font-bold">
            {isMuted ? 'MUTED' : 'ACTIVE'}
          </div>
        </div>
      </Button>
    </div>
  );
}

