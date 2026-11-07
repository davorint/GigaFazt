"use client"

import { useId } from "react"
import { Pause, Play } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import { setMotionPaused, useMotionState } from "@/lib/motion"

/**
 * Pause / resume every looping animation (hero 3D, live telemetry, map pulses,
 * featured-plan border, status pulse): WCAG 2.2.2. When the OS already asks for
 * reduced motion it stays focusable but aria-disabled, with the reason as its
 * description (a `disabled` button would hide that from keyboard users).
 */
export function MotionToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const t = useTranslations("motion")
  const { reduced, system } = useMotionState()
  // Constant name; aria-pressed carries the state.
  const label = t("pause")
  const Icon = reduced ? Play : Pause
  const noteId = useId()

  return (
    <button
      type="button"
      aria-pressed={reduced}
      aria-label={withLabel ? undefined : label}
      title={system ? t("system") : label}
      aria-disabled={system || undefined}
      aria-describedby={system ? noteId : undefined}
      onClick={() => {
        if (!system) setMotionPaused(!reduced)
      }}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-disabled:opacity-60",
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {withLabel && <span>{label}</span>}
      {system && (
        <span id={noteId} className="sr-only">
          {t("system")}
        </span>
      )}
    </button>
  )
}
