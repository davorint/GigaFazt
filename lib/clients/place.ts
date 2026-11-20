/**
 * Where a client lives, written out (owner review 2026-11-20): a client in a deployment is "<deployment> · <tower> ·
 * <apartment>" from Despliegues; otherwise the building and tower typed on the client. Used by the client list, the
 * client picker and new appointments (which before showed only the apartment for clients in a deployment).
 */
import type { Client } from "./model"
import { siteLabel, towerLabel, type Site } from "../sites/model"

export function clientPlace(c: Pick<Client, "siteId" | "towerId" | "building" | "tower" | "apartment">, sites: Site[]): string {
  const site = c.siteId ? sites.find((s) => s.id === c.siteId) : undefined
  if (!site) return [c.building, c.tower, c.apartment].filter(Boolean).join(" · ")
  const i = site.towers.findIndex((t) => t.id === c.towerId)
  return [siteLabel(site), i >= 0 ? towerLabel(site.towers[i], i) : c.tower, c.apartment].filter(Boolean).join(" · ")
}
