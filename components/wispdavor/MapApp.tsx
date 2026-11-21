"use client"

import { useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { localToday } from "@/lib/clients/from-lead"
import { mapSites, toneOf, type MapSite } from "@/lib/wispdavor/mapa"
import { useWispData } from "./useWispData"

// MapLibre (+ its CSS) loads only on this page, never in the initial bundle.
const ClientsMap = dynamic(() => import("./ClientsMap"), { ssr: false, loading: () => <div aria-hidden className="h-[420px] rounded-2xl border border-white/10 sm:h-[560px]" /> })

const TONE = { ok: "bg-emerald-400", late: "bg-amber-400", suspended: "bg-red-400", empty: "bg-zinc-400" } as const

/** /interno/software/wispdavor/mapa: the deployments on the map with their clients, and the same as a list. */
export function MapApp() {
  const t = useTranslations("wispdavor.mapa")
  const d = useWispData()
  const sites = useMemo(() => (d.loaded ? mapSites(d.sites, d.surveys, d.clients, d.payments, localToday()) : []), [d.loaded, d.sites, d.surveys, d.clients, d.payments])
  const line = useCallback((s: MapSite) => [t("clients", { n: s.clients }), s.late ? t("late", { n: s.late }) : "", s.suspended ? t("suspended", { n: s.suspended }) : ""].filter(Boolean).join(" · "), [t])
  if (!d.loaded) return null
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      <ClientsMap sites={sites} label={t("map")} line={line} />
      <section aria-labelledby="wd-map-list" className="grid gap-2">
        <h2 id="wd-map-list" className="text-lg font-light text-foreground">
          {t("list")}
        </h2>
        {!sites.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {sites.map((s) => (
            <li key={s.id}>
              <a href={`/interno/admin/despliegues?d=${s.id}`} className="flex items-start gap-3 rounded-xl border border-white/10 p-3 hover:bg-white/[0.03]">
                <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${TONE[toneOf(s)]}`} />
                <span className="grid gap-0.5">
                  <span className="text-sm text-zinc-100">{s.name}</span>
                  <span className="font-mono text-xs text-zinc-400">{line(s)}</span>
                  {s.lat === null && <span className="text-xs text-amber-200">{t("noPoint")}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
