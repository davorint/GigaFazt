"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { siteLabel } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { BODEGA, placeSite, placesUsed, sitePlace } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"

/** "Bodega", or the location's name for "s:<id>". */
export function usePlaceLabel() {
  const t = useTranslations("materiales")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  return (place: string) => {
    if (place === BODEGA) return t("stock.bodega")
    const s = sites.find((x) => x.id === placeSite(place))
    return s ? siteLabel(s) : t("stock.unknownPlace")
  }
}

/**
 * The places to choose from: the warehouse, every location, then places of a deleted location that still hold stock or
 * units (so what was left there can be moved out).
 */
export function usePlaceOptions() {
  const t = useTranslations("materiales")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const known = new Set([BODEGA, ...sites.map((s) => sitePlace(s.id))])
  const gone = placesUsed(moves, units).filter((p) => !known.has(p))
  return [
    { value: BODEGA, label: t("stock.bodega") },
    ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: sitePlace(s.id), label: siteLabel(s) })),
    ...gone.map((p) => ({ value: p, label: `${t("stock.unknownPlace")} (${placeSite(p).slice(0, 6)})` })),
  ]
}

export { clientLine } from "@/components/clients/ClientPick"
