"use client"

import { useTranslations } from "next-intl"
import { cn } from "cn"

/**
 * Visible placeholder for an unfilled BUSINESS.md value (hard rule #1).
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
        "inline-flex items-center whitespace-nowrap rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-warn",
        className
      )}
    >
      {t("placeholder")}
    </span>
  )
}
