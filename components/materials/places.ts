"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { siteLabel } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { BODEGA, placeSite, sitePlace } from "@/lib/stock/model"

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

/** The places to choose from: the warehouse, then every location. */
export function usePlaceOptions() {
  const t = useTranslations("materiales")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  return [{ value: BODEGA, label: t("stock.bodega") }, ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: sitePlace(s.id), label: siteLabel(s) }))]
}

export { clientLine } from "@/components/clients/ClientPick"
