/**
 * Tablero 2, fourth round (owner, 2026-11-23: "5 more custom made, cutting edge, impressive graphs"). Pure figures:
 *
 * - revenueTree: deployment → tower → client, each client's value what its live services charge, and how it stands
 *   with Cobranza (the zoomable circle packing).
 * - faultMatrix: fault reports of the last days per deployment and kind (the chord diagram).
 * - payPrints: every payment of the last months as (day of the month it came, months the client had been with us),
 *   and the share paid by the due day among new and old clients (the density contours). A payment after the due day
 *   may be late or early for next month: the chart doesn't tell them apart, and the copy doesn't call them late.
 * - compareRows: each deployment's eight measures side by side (the parallel coordinates).
 * The horizon chart draws the hourly traffic the server sends (tablero2-server.ts) against each deployment's links.
 */
import { priceAt, type Client } from "../clients/model"
import { ledger, monthOf, type Payment } from "../payments/model"
import type { Report } from "../reports/model"
import { siteLabel, type Site } from "../sites/model"
import { REPAIR_GROUPS, type RepairGroup } from "./tablero2-more"
import { liveOn, type Tone } from "./tablero2"

// ── Revenue tree (circle packing) ───────────────────────────────────────────

export type Leaf = { id: string; value: number; tone: Tone; place: string; plan: string }
export type TreeNode = { id: string; name: string; children: (TreeNode | Leaf)[] }

/**
 * The money map: deployments ("" = none) → towers ("" = none, or the only tower) → clients with a live service; a
 * client's value is what its services live today charge this month (dated prices, as the MRR; a suspended one still
 * owes it; a scheduled install isn't a client yet).
 */
export function revenueTree(sites: Site[], clients: Client[], payments: Payment[], today: string): TreeNode {
  const known = new Map(sites.map((s) => [s.id, s]))
  const bySite = new Map<string, Map<string, Leaf[]>>()
  for (const c of clients) {
    const live = c.services.filter((s) => liveOn(s, today))
    const value = live.reduce((a, s) => a + (priceAt(s, monthOf(today)) ?? 0), 0)
    if (!live.length || value <= 0) continue
    const site = known.get(c.siteId)
    const siteId = site ? site.id : ""
    // One tower: everyone is in it. Several: the client's own tower, or "" (no tower written down).
    const tower = !site ? "" : site.towers.length === 1 ? site.towers[0].id : site.towers.some((t) => t.id === c.towerId) ? c.towerId : ""
    const tone: Tone = live.some((s) => s.status === "suspendido") ? "suspendido" : ledger(c, payments, today).status
    const leaf: Leaf = { id: c.id, value, tone, place: [c.tower, c.apartment].filter(Boolean).join(" · "), plan: live.find((s) => s.type === "internet")?.plan.trim() ?? "" }
    const towers = bySite.get(siteId) ?? new Map<string, Leaf[]>()
    towers.set(tower, [...(towers.get(tower) ?? []), leaf])
    bySite.set(siteId, towers)
  }
  return {
    id: "root",
    name: "",
    children: [...bySite].map(([siteId, towers]) => {
      const s = known.get(siteId)
      return {
        id: `s:${siteId}`,
        name: s ? siteLabel(s) : "",
        children: [...towers].map(([towerId, leaves]) => ({ id: `t:${siteId}:${towerId}`, name: s?.towers.find((t) => t.id === towerId)?.name.trim() ?? "", children: leaves })),
      }
    }),
  }
}

// ── Faults by deployment and kind (chord) ───────────────────────────────────

const GROUP_OF: Record<string, RepairGroup> = { "sin-servicio": "sin-servicio", lento: "lento", intermitente: "lento", wifi: "wifi", equipo: "wifi", tv: "otro", otro: "otro" }

export type FaultMatrix = { sites: { id: string; name: string }[]; kinds: readonly RepairGroup[]; counts: number[][]; total: number }

/** Reports opened in the last `days` days (discarded left out): rows = deployments with any ("" = none), columns = kinds. */
export function faultMatrix(reports: Report[], sites: Site[], now: number, days = 90): FaultMatrix {
  const from = now - days * 864e5
  const known = new Map(sites.map((s) => [s.id, s]))
  const rows = new Map<string, number[]>()
  let total = 0
  for (const r of reports) {
    const t = Date.parse(r.createdAt)
    if (r.status === "descartado" || !Number.isFinite(t) || t < from || t > now) continue
    const key = known.has(r.siteId) ? r.siteId : ""
    const row = rows.get(key) ?? REPAIR_GROUPS.map(() => 0)
    row[REPAIR_GROUPS.indexOf(GROUP_OF[r.category] ?? "otro")]++
    rows.set(key, row)
    total++
  }
  const list = [...rows].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))
  return { sites: list.map(([id]) => ({ id, name: id ? siteLabel(known.get(id) as Site) : "" })), kinds: REPAIR_GROUPS, counts: list.map(([, c]) => c), total }
}

// ── Payment fingerprint (density contours) ──────────────────────────────────

export type PayPrint = { day: number; tenure: number }

/**
 * Every payment of the last `months` months as the day of the month it came and the client's months with us at that
 * moment (from its first service), and the share paid by `due` among clients under 3 months and over 12.
 */
export function payPrints(payments: Payment[], clients: Client[], today: string, months = 12, due = 10): { points: PayPrint[]; fresh: number | null; loyal: number | null; maxTenure: number } {
  const start = new Map<string, string>()
  for (const c of clients) {
    const first = c.services.map((s) => s.start).filter(Boolean).sort()[0]
    if (first) start.set(c.id, first)
  }
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - months * 30.44 * 864e5).toISOString().slice(0, 10)
  const points: PayPrint[] = []
  for (const p of payments) {
    const s = start.get(p.clientId)
    if (!s || p.date < from || p.date > today || p.date < s) continue
    points.push({ day: Number(p.date.slice(8, 10)), tenure: Math.max(0, (Date.parse(p.date) - Date.parse(s)) / (30.44 * 864e5)) })
  }
  const share = (xs: PayPrint[]) => (xs.length ? xs.filter((x) => x.day <= due).length / xs.length : null)
  return { points, fresh: share(points.filter((x) => x.tenure < 3)), loyal: share(points.filter((x) => x.tenure >= 12)), maxTenure: Math.max(1, ...points.map((x) => x.tenure)) }
}

// ── Deployments side by side (parallel coordinates) ─────────────────────────

export const MEASURES = ["clients", "penetration", "income", "profit", "use", "latency", "availability", "faults"] as const
export type Measure = (typeof MEASURES)[number]
/** Whether more is better on each axis (the chart puts "better" on top). */
export const BETTER_HIGH: Record<Measure, boolean> = { clients: true, penetration: true, income: true, profit: true, use: false, latency: false, availability: true, faults: false }
export type CompareRow = { id: string; name: string; values: Record<Measure, number | null> }

/** Faults per 10 active clients in the window: comparable across deployments of different sizes. */
export const faultsPer10 = (faults: number, active: number) => (active ? (faults / active) * 10 : null)

/** One row per deployment with any measure; missing measures stay null (the line skips that axis). */
export function compareRows(sites: { id: string; name: string }[], get: (id: string) => Partial<Record<Measure, number | null>>): CompareRow[] {
  return sites
    .map((s) => {
      const v = get(s.id)
      return { id: s.id, name: s.name, values: Object.fromEntries(MEASURES.map((m) => [m, v[m] ?? null])) as Record<Measure, number | null> }
    })
    .filter((r) => MEASURES.some((m) => r.values[m] !== null))
}
