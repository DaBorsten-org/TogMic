import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // Base layout
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        // Sizing
        "data-[size=default]:h-[26px] data-[size=default]:w-[46px] data-[size=default]:p-[3px]",
        "data-[size=sm]:h-[20px] data-[size=sm]:w-[36px] data-[size=sm]:p-[2px]",
        // OFF state: inset shadow gives a pressed-in, recessed look
        "data-unchecked:bg-input/60 dark:data-unchecked:bg-input/40",
        "data-unchecked:[box-shadow:inset_0_2px_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.06)]",
        "dark:data-unchecked:[box-shadow:inset_0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.04)]",
        // ON state: raised, glowing
        "data-checked:bg-primary",
        "data-checked:[box-shadow:0_0_0_1px_color-mix(in_oklch,var(--color-primary)_80%,transparent),0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]",
        "dark:data-checked:[box-shadow:0_0_8px_2px_color-mix(in_oklch,var(--color-primary)_35%,transparent),0_0_0_1px_color-mix(in_oklch,var(--color-primary)_60%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)]",
        // Focus
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        // Disabled
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        // Transition
        "transition-[background-color,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        "active:scale-[0.96]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0",
          // Thumb sizing per track size
          "group-data-[size=default]/switch:size-5",
          "group-data-[size=sm]/switch:size-4",
          // OFF position
          "group-data-[size=default]/switch:data-unchecked:translate-x-0",
          "group-data-[size=sm]/switch:data-unchecked:translate-x-0",
          // ON position — track width minus thumb size minus 2×padding
          "group-data-[size=default]/switch:data-checked:translate-x-5",
          "group-data-[size=sm]/switch:data-checked:translate-x-4",
          // Thumb color and depth — white pill with subtle shadow for OFF
          "bg-white",
          "data-unchecked:[box-shadow:0_1px_3px_rgba(0,0,0,0.22),0_1px_1px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]",
          // ON: slightly brighter, more prominent shadow
          "data-checked:[box-shadow:0_2px_4px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.95)]",
          // Transition
          "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
