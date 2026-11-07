"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { fetchStatus } from "@/lib/status-client"
import { hasUptime, uptimeAverage, uptimeLevel, type StatusResponse } from "@/lib/status"

const LEVEL_CLASS = { ok: "bg-ok/80", warn: "bg-warn", down: "bg-destructive" } as const

/**
 * 90-day uptime bar from /api/status (SPEC §6). Renders nothing until a status
 * provider returns real data (hard rule #3): no placeholder bars, no mock.
 */
export function UptimeBar() {
  const t = useTranslations("proof.uptime")
  const locale = useLocale()
  const [data, setData] = useState<StatusResponse | null>(null)

  useEffect(() => {
    let active = true
    fetchStatus().then((d) => {
      if (active) setData(d)
    })
    return () => {
      active = false
    }
  }, [])

  if (!hasUptime(data)) return null

  const days = data.uptime90d.slice(-90)
  const avg = uptimeAverage(days) ?? 0
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 3 }).format(v)

  return (
    <figure className="rounded-xl border border-border bg-surface p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{t("title", { days: days.length })}</span>
        <span className="font-mono tabular-nums text-ok">{pct(avg)}</span>
      </figcaption>
      <div className="mt-4 flex h-8 items-stretch gap-[2px]" aria-hidden>
        {days.map((d, i) => (
          <span
            key={i}
            title={pct(d)}
            className={cn("flex-1 rounded-[1px]", LEVEL_CLASS[uptimeLevel(d)])}
          />
        ))}
      </div>
      <p className="sr-only">{t("summary", { days: days.length, pct: pct(avg) })}</p>
      <div className="mt-2 flex justify-between font-mono text-[0.65rem] text-muted-foreground">
        <span>{t("ago", { days: days.length })}</span>
        <span>{t("today")}</span>
      </div>
    </figure>
  )
}
