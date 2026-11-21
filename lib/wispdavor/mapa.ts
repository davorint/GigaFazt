/**
 * The clients map (WispDavor → Mapa, owner 2026-11-21): each deployment at its survey's point (a survey turned into a
 * deployment keeps its siteId; lib/sites/from-survey.ts) with its clients: how many have service, how many are late
 * (Cobranza) and how many suspended. Deployments without a point are listed apart. Internal only: exact locations
 * never go on the public site (hard rule 6).
 */
import type { Client } from "../clients/model"
import { ledger, type Payment } from "../payments/model"
import { siteLabel, type Site } from "../sites/model"
import type { Survey } from "../survey/model"

export type MapSite = { id: string; name: string; lat: number | null; lng: number | null; clients: number; late: number; suspended: number }
export type Tone = "ok" | "late" | "suspended" | "empty"

export function mapSites(sites: Site[], surveys: Survey[], clients: Client[], payments: Payment[], today: string): MapSite[] {
  return sites
    .map((s) => {
      const sv = surveys.find((x) => x.siteId === s.id && x.ident.lat !== null && x.ident.lng !== null)
      const mine = clients.filter((c) => c.siteId === s.id && c.services.some((x) => x.status !== "cancelado"))
      return {
        id: s.id,
        name: siteLabel(s),
        lat: sv?.ident.lat ?? null,
        lng: sv?.ident.lng ?? null,
        clients: mine.length,
        late: mine.filter((c) => ledger(c, payments, today).status === "atrasado").length,
        suspended: mine.filter((c) => c.services.some((x) => x.status === "suspendido")).length,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
}

export const toneOf = (s: MapSite): Tone => (!s.clients ? "empty" : s.suspended ? "suspended" : s.late ? "late" : "ok")
