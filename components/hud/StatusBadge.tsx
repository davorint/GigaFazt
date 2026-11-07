"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import { fetchStatus } from "@/lib/status-client"
import type { ServiceStatus } from "@/lib/status"

/**
 * Status badge sourced from /api/status. Hidden entirely when status is unknown
 * (hard rule #3). The pulse ring goes static under reduced motion (via globals).
 */
export function StatusBadge({ className }: { className?: string }) {
  const t = useTranslations("status")
  const [status, setStatus] = useState<ServiceStatus>("unknown")

  useEffect(() => {
    let active = true
    fetchStatus().then((d) => {
      if (active) setStatus(d.status)
    })
    return () => {
      active = false
    }
  }, [])

  if (status === "unknown") return null

  const color = status === "operational" ? "text-ok" : "text-warn"
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}>
      <span
        className={cn("size-2 rounded-full bg-current", color)}
        style={{ animation: "status-pulse 2.5s ease-out infinite" }}
        aria-hidden
      />
      <span className={color}>{t(status)}</span>
    </span>
  )
}
