"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { StockPanel } from "./StockPanel"
import { RollsPanel } from "./RollsPanel"
import { UnitsPanel } from "./UnitsPanel"

const TABS = ["existencias", "bobinas", "equipos"] as const
type Tab = (typeof TABS)[number]
/** Prices and suppliers moved to their own page (owner, 2026-11-18). */
export const BUY_PAGE = "/interno/admin/compras-materiales"

const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}

/** Materials in stock: what each place has, the fiber rolls and the ONTs by serial number (tabs, in the URL). */
export function MaterialsApp() {
  const t = useTranslations("materiales")
  const store = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const search = useSyncExternalStore(subscribeUrl, () => window.location.search, () => "")
  const params = new URLSearchParams(search)
  const raw = params.get("t") ?? ""
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "existencias"
  // Links made before the split (?m=<item>, ?t=precios) open the material on the buying page.
  const legacy = params.get("m") || raw === "precios" ? `${BUY_PAGE}${params.get("m") ? `?m=${encodeURIComponent(params.get("m")!)}` : ""}` : ""
  useEffect(() => {
    if (legacy) window.location.replace(legacy)
  }, [legacy])
  const setTab = (k: Tab) => {
    const p = new URLSearchParams(window.location.search)
    if (k === "existencias") p.delete("t")
    else p.set("t", k)
    window.history.pushState(null, "", p.toString() ? `?${p}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  if (!store.loaded || legacy) return null
  return (
    <div className="mt-6 grid gap-5">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="min-h-10 flex-1 rounded-lg px-4 text-sm text-zinc-300 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-selected:bg-white/10 aria-selected:text-foreground sm:flex-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={t(`tabs.${tab}`)}>
        {tab === "existencias" && <StockPanel items={store.items} />}
        {tab === "bobinas" && <RollsPanel />}
        {tab === "equipos" && <UnitsPanel items={store.items} />}
      </div>
    </div>
  )
}
