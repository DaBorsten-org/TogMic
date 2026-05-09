import { useApp } from '@/contexts/useApp';
import { useMuteState } from '@/contexts/useMuteState';
import { cn } from '@/lib/utils';
import { Mic, MicOff } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export function MuteIndicator() {
  const { t } = useTranslation();
  const { isMuted, toggleMute } = useMuteState();
  const { activeProfile } = useApp();
  const disabled = !activeProfile;

  const handleClick = useCallback(() => {
    if (!disabled) toggleMute();
  }, [toggleMute, disabled]);

  return (
    <div className="flex justify-center">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          "relative h-52 w-52 rounded-full transition-all duration-150 cursor-pointer select-none",
          "active:translate-y-0.5 active:scale-[0.985]",
          disabled && "opacity-40 cursor-not-allowed",
          isMuted
            ? "bg-gradient-to-br from-muted to-muted-foreground/20"
            : "bg-gradient-to-br from-primary/80 to-primary"
        )}
        style={{
          boxShadow: isMuted
            ? "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -3px 0 rgba(0,0,0,0.25), 0 8px 32px -4px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2)"
            : "inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -3px 0 rgba(0,0,0,0.18), 0 8px 32px -4px color-mix(in oklch, var(--color-primary) 50%, transparent), 0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {/* spinning dashed ring when live */}
        {!isMuted && !disabled && (
          <span
            className="absolute inset-[-14px] rounded-full border border-dashed opacity-40 pointer-events-none"
            style={{
              borderColor: "var(--color-primary)",
              animation: "tog-spin 14s linear infinite",
            }}
          />
        )}
        <div className={cn("relative flex flex-col items-center gap-2", isMuted ? "text-muted-foreground" : "text-white")}>
          {isMuted ? (
            <MicOff className="size-10" strokeWidth={1.6} />
          ) : (
            <Mic className="size-10" strokeWidth={1.6} />
          )}
          <span className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase">
            {disabled ? t("noProfile") : isMuted ? t("muted") : t("active")}
          </span>
        </div>
      </button>
    </div>
  );
}
