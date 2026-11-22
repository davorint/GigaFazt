"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { FULL_SHARE, DAYS, type SiteCapacity } from "@/lib/wispdavor/capacity"
import { LineChart, SERIES_COLORS } from "./LineChart"

type Row = SiteCapacity & { profile: { h: number; down: number; up: number }[] }
const n1 = (x: number) => x.toLocaleString("es-MX", { maximumFractionDigits: 1 })
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`)
/** Hours of the day as chart times (any fixed day; only the hour is shown). */
const HOURS = Array.from({ length: 24 }, (_, h) => `2026-01-01T${String(h).padStart(2, "0")}:00:00`)

/**
 * /interno/software/wispdavor/capacidad (phase 13): how full each deployment's carrier links get at the busy hour, how
 * many more clients fit, and the hour-of-day profile. From the routers' traffic and the links' speeds in Despliegues.
 */
export function CapacityApp() {
  const t = useTranslations("wispdavor.capacidad")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    fetch("/api/interno/capacidad", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { sites?: Row[] }
        if (!live) return
        if (r.ok && b.sites) setRows(b.sites)
        else setError(true)
      })
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [])
  if (error) return <p className="mt-6 text-sm text-amber-200">{t("offline")}</p>
  if (!rows) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-zinc-300">{t("lead", { days: DAYS, full: Math.round(FULL_SHARE * 100) })}</p>
      <p className="text-xs text-zinc-400">
        <span className="mr-2 rounded border border-amber-300/40 px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide text-amber-200">{t("tag")}</span>
        {t("estimate")}
      </p>
      {!rows.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      <ul className="grid gap-4">
        {rows.map((s) => {
          const tone = s.full ? "text-red-300" : s.use !== null && s.use >= 0.6 ? "text-amber-200" : "text-emerald-300"
          return (
            <li key={s.siteId} className={`grid gap-3 rounded-2xl border p-4 ${s.full ? "border-red-400/50" : "border-white/10"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={`/interno/admin/despliegues?d=${s.siteId}`} className="text-base text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-white">
                  {s.name}
                </a>
                <span className={`font-mono text-lg ${tone}`}>{pct(s.use)}</span>
              </div>
              {s.use !== null && (
                <div role="meter" aria-label={t("useLabel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.use * 100)} className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full ${s.full ? "bg-red-400" : s.use >= 0.6 ? "bg-amber-300" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, Math.round(s.use * 100))}%` }} />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-zinc-400">{t("links")}</dt>
                  <dd className="font-mono text-zinc-100">{s.speed.down === null ? t("noSpeed") : `${n1(s.speed.down)} / ${s.speed.up === null ? "—" : n1(s.speed.up)} Mbps`}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">{t("busy")}</dt>
                  <dd className="font-mono text-zinc-100">{s.busy ? `${n1(s.busy.down)} / ${n1(s.busy.up)} Mbps` : t("noTraffic")}</dd>
                  {s.busy && <dd className="text-xs text-zinc-400">{new Date(s.busy.hour).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd>}
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">{t("perClient")}</dt>
                  <dd className="font-mono text-zinc-100">{s.perClient === null ? "—" : `${n1(s.perClient)} Mbps`}</dd>
                  <dd className="text-xs text-zinc-400">{t("active", { n: s.activeClients })}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">{t("roomFor")}</dt>
                  <dd className={`font-mono ${s.roomFor === 0 ? "text-red-300" : "text-zinc-100"}`}>{s.roomFor === null ? "—" : t("clients", { n: s.roomFor })}</dd>
                </div>
              </dl>
              {s.full && <p className="text-xs text-red-300">{t("fullHint")}</p>}
              {s.speed.down === null && <p className="text-xs text-amber-200">{t("setSpeed")}</p>}
              {s.busy && (
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-300">{t("profile")}</summary>
                  <div className="mt-2">
                    <LineChart
                      times={HOURS}
                      when={(x) => `${Number(x.slice(11, 13))}:00`}
                      series={[
                        { label: t("down"), color: SERIES_COLORS[0], values: s.profile.map((p) => Math.round(p.down * 10) / 10) },
                        { label: t("up"), color: SERIES_COLORS[1], values: s.profile.map((p) => Math.round(p.up * 10) / 10) },
                      ]}
                      label={t("profile")}
                      unit="Mbps"
                      fmt={(x) => `${n1(x)} Mbps`}
                    />
                  </div>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
