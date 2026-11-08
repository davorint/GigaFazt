"use client"

import { useTranslations } from "next-intl"
import { cn } from "cn"

/**
 * Visible placeholder for an unfilled BUSINESS.md value (hard rule #1).
 * Quiet style (dashed outline, no fill): still visible, but it no longer
 * competes with the real figures around it.
 * `keyName` is the BUSINESS.md key, surfaced in the tooltip for the owner.
 */
export function PlaceholderChip({
  keyName,
  className,
}: {
  keyName: string
  className?: string
}) {
  const t = useTranslations("common")
  return (
    <span
      title={`${t("placeholderTitle")}: ${keyName}`}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border border-dashed border-warn/45 px-1.5 py-px font-mono text-[0.6rem] uppercase tracking-wider text-warn/90",
        className
      )}
    >
      {t("placeholder")}
    </span>
  )
}
