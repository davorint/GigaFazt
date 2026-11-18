"use client"

import { useSyncExternalStore } from "react"
import { reportsStore } from "@/lib/reports/store"

/** How many reports are still "nuevo", next to "Reportes de clientes" on every admin page (as synced to this phone). */
export function NewReportsBadge({ label }: { label: string }) {
  const n = useSyncExternalStore(reportsStore.subscribe, () => reportsStore.snapshot().list.filter((r) => r.status === "nuevo").length, () => 0)
  if (!n) return null
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-sky-400/20 px-1.5 text-xs text-sky-100">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  )
}
