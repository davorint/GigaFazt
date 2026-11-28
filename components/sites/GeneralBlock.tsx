"use client"

import { useState } from "react"
import { InlineField } from "@/components/interno/InlineField"
import { mxn } from "@/lib/materials/catalog"
import { linksCost, parsePoint, roomCapacity, siteCost, siteProfit, towerApartments, unpricedLinks, type Site } from "@/lib/sites/model"
import type { SiteStats } from "@/lib/sites/stats"
import { PlaceInline } from "./PlaceInline"
import { SheetBlock } from "./SheetBlock"
import { FIELDS, SMALL, type T, type Up } from "./sheet-ui"

const round = (n: number) => Math.round(n * 1e6) / 1e6

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-lg border border-white/10 px-3 py-2">
      <span className="truncate text-[0.7rem] text-zinc-400">{label}</span>
      <span className={`font-mono text-base ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-zinc-100"}`}>{value}</span>
      {hint && <span className="text-[0.7rem] leading-snug text-zinc-400">{hint}</span>}
    </div>
  )
}

/** Name, address, place and map point, the notes, and the month's figures. */
export function GeneralBlock({ t, s, up, stats }: { t: T; s: Site; up: Up; stats: SiteStats }) {
  const [locating, setLocating] = useState<"" | "busy" | "failed">("")
  const apartments = s.towers.reduce((a, x) => a + (towerApartments(x) ?? 0), 0)
  const capacity = s.rooms.map(roomCapacity).filter((x): x is number => x !== null)
  const profit = siteProfit(s, stats.monthly)
  const point = s.lat !== null && s.lng !== null ? `${s.lat}, ${s.lng}` : ""
  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("failed")
    setLocating("busy")
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating("")
        up({ lat: round(p.coords.latitude), lng: round(p.coords.longitude) })
      },
      () => setLocating("failed"),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }
  return (
    <SheetBlock id="general" title={t("nav.general")}>
      <div className={FIELDS}>
        <InlineField kind="text" anchor="name" label={t("general.name")} value={s.name} onSave={(name) => up({ name })} hint={t("general.nameHint")} max={200} className="col-span-full lg:col-span-1" />
        <InlineField kind="text" anchor="address" label={t("general.address")} value={s.address} onSave={(address) => up({ address })} max={300} className="col-span-full lg:col-span-2" />
        <PlaceInline state={s.state} municipality={s.municipality} onChange={(p) => up(p)} />
        <div className="col-span-full grid content-start gap-1 lg:col-span-1">
          <InlineField
            kind="text"
            anchor="location"
            label={t("sheet.location")}
            value={point}
            hint={t("sheet.locationHint")}
            check={(v) => (parsePoint(v) ? "" : t("sheet.locationInvalid"))}
            onSave={(v) => {
              const p = parsePoint(v)
              up(p ? { lat: round(p.lat), lng: round(p.lng) } : { lat: null, lng: null })
            }}
          />
          <div className="flex flex-wrap items-center gap-2 px-2">
            <button type="button" onClick={locate} disabled={locating === "busy"} className={SMALL}>
              {locating === "busy" ? t("sheet.locating") : t("sheet.locate")}
            </button>
            {point && (
              <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer noopener" className="text-xs text-zinc-300 underline decoration-white/30 underline-offset-4 hover:text-foreground">
                {t("sheet.openMap")}
              </a>
            )}
            {locating === "failed" && (
              <span role="alert" className="text-xs text-red-300">
                {t("sheet.locateFailed")}
              </span>
            )}
          </div>
        </div>
      </div>
      <InlineField kind="area" label={t("general.notes")} value={s.notes} onSave={(notes) => up({ notes })} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t("general.tiles.clients")} value={t("sheet.clientsValue", { clients: stats.clients, active: stats.active })} hint={apartments ? t("sheet.penetration", { pct: Math.round((stats.active / apartments) * 100), apartments }) : undefined} />
        <Stat label={t("general.tiles.monthly")} value={mxn(stats.monthly)} hint={t("general.monthlyHint")} />
        <Stat label={t("sheet.costs")} value={mxn(siteCost(s) + linksCost(s))} hint={unpricedLinks(s) ? t("general.linksMissing", { n: unpricedLinks(s) }) : t("sheet.costsHint", { building: mxn(siteCost(s)), links: mxn(linksCost(s)) })} />
        <Stat label={t("general.tiles.profit")} value={mxn(profit)} hint={capacity.length ? t("sheet.capacity", { mbps: capacity.reduce((a, b) => a + b, 0) }) : t("general.profitHint")} tone={profit > 0 ? "good" : profit < 0 ? "bad" : undefined} />
      </div>
    </SheetBlock>
  )
}
