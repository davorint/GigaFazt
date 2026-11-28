/**
 * Tablero 2, fourth round (owner, 2026-11-23: "5 more custom made, cutting edge, impressive graphs"). Pure figures:
 *
 * - revenueTree: deployment → tower → client, each client's value what its live services charge, and how it stands
 *   with Cobranza (the zoomable circle packing).
 * - faultMatrix: fault reports of the last days per deployment and kind (counts, for the table and the comparator).
 * - faultQuake: the same reports as events in time per deployment, repeats of a client, the network's daily pulse
 *   (the fault seismograph).
 * - payPrints: every payment of the last months as (day of the month it came, months the client had been with us),
 *   and the share paid by the due day among new and old clients (the density contours). A payment after the due day
 *   may be late or early for next month: the chart doesn't tell them apart, and the copy doesn't call them late.
 * - compareRows: each deployment's eight measures side by side (the parallel coordinates).
 * The horizon chart draws the hourly traffic the server sends (tablero2-server.ts) against each deployment's links.
 */
import { priceAt, type Client } from "../clients/model"
import { ledger, monthOf, type Payment } from "../payments/model"
import { isOpen, type Report } from "../reports/model"
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

export type QuakeEvent = { id: string; t: number; day: number; kind: RepairGroup; open: boolean; who: string; hours: number | null; stack: number }
export type QuakeLane = {
  id: string
  name: string
  /** By day, then kind (so a day's needle is grouped by kind), then time; `stack` = place in its day's needle. */
  events: QuakeEvent[]
  byKind: number[]
  total: number
  active: number
  per10: number | null
  /** A client reporting again: indexes into `events`, consecutive reports of the same client. */
  repeats: { a: number; b: number; days: number }[]
  /** Reports of the last 30 days vs the 30-day average of the 60 before (null = none before). */
  trend: number | null
}
export type FaultQuake = { from: number; now: number; days: number; lanes: QuakeLane[]; pulse: number[][]; byKind: number[]; total: number; repeatClients: number; quickRepeat: number; maxStack: number }

/**
 * The fault seismograph: every report of the last `days` days (discarded left out) on its deployment's lane ("" =
 * none) on the day it was opened, colored by kind; consecutive reports of the same client joined (a repeat; within 30
 * days = it came back quickly); per lane the kind mix, reports per 10 active clients and the last 30 days vs before;
 * and the whole network's reports per day and kind (the pulse on top). Lanes: most reports first.
 */
export function faultQuake(reports: Report[], sites: Site[], names: Map<string, string>, active: Map<string, number>, now: number, days = 90): FaultQuake {
  const from = now - days * 864e5
  const known = new Map(sites.map((s) => [s.id, s]))
  const pulse = Array.from({ length: days }, () => REPAIR_GROUPS.map(() => 0))
  const byLane = new Map<string, { e: QuakeEvent; client: string }[]>()
  for (const r of reports) {
    const t = Date.parse(r.createdAt)
    if (r.status === "descartado" || !Number.isFinite(t) || t < from || t > now) continue
    const kind = GROUP_OF[r.category] ?? "otro"
    const day = Math.min(days - 1, Math.floor((t - from) / 864e5))
    const done = Date.parse(r.resolvedAt)
    const open = isOpen(r)
    const e: QuakeEvent = { id: r.id, t, day, kind, open, who: (r.clientId && names.get(r.clientId)) || r.name.trim(), hours: open ? (now - t) / 36e5 : Number.isFinite(done) ? Math.max(0, (done - t) / 36e5) : null, stack: 0 }
    const key = known.has(r.siteId) ? r.siteId : ""
    byLane.set(key, [...(byLane.get(key) ?? []), { e, client: r.clientId }])
    pulse[day][REPAIR_GROUPS.indexOf(kind)]++
  }
  let maxStack = 1
  const repeaters = new Set<string>()
  const quick = new Set<string>()
  const lanes: QuakeLane[] = [...byLane].map(([id, list]) => {
    list.sort((a, b) => a.e.day - b.e.day || REPAIR_GROUPS.indexOf(a.e.kind) - REPAIR_GROUPS.indexOf(b.e.kind) || a.e.t - b.e.t)
    const events = list.map((x) => x.e)
    for (let i = 0; i < events.length; i++) {
      events[i].stack = i && events[i - 1].day === events[i].day ? events[i - 1].stack + 1 : 0
      maxStack = Math.max(maxStack, events[i].stack + 1)
    }
    const last = new Map<string, number>()
    const repeats: QuakeLane["repeats"] = []
    list.forEach((x, i) => {
      if (!x.client) return
      const prev = last.get(x.client)
      if (prev !== undefined) {
        const gap = (events[i].t - events[prev].t) / 864e5
        repeats.push({ a: prev, b: i, days: gap })
        repeaters.add(x.client)
        if (gap <= 30) quick.add(x.client)
      }
      last.set(x.client, i)
    })
    const byKind = REPAIR_GROUPS.map((g) => events.filter((e) => e.kind === g).length)
    const recent = events.filter((e) => e.t > now - 30 * 864e5).length
    const earlier = events.length - recent
    const n = id ? (active.get(id) ?? 0) : 0
    return { id, name: id ? siteLabel(known.get(id) as Site) : "", events, byKind, total: events.length, active: n, per10: faultsPer10(events.length, n), repeats, trend: earlier ? recent / (earlier / 2) : null }
  })
  lanes.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const byKind = REPAIR_GROUPS.map((_, k) => pulse.reduce((a, d) => a + d[k], 0))
  return { from, now, days, lanes, pulse, byKind, total: byKind.reduce((a, b) => a + b, 0), repeatClients: repeaters.size, quickRepeat: quick.size, maxStack }
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

// ── Scoreboard against the network median ───────────────────────────────────

/** One measure of one deployment: its value, how far it is from the median in the "better" direction (> 0 = better), that distance ÷ the widest one on the measure (−1…1), and its place. */
export type ScoreCell = { value: number | null; dev: number; norm: number; rank: number; of: number }
export type ScoreRow = { id: string; name: string; cells: Record<Measure, ScoreCell>; wins: number; losses: number; score: number }
export type ScoreBoard = { medians: Record<Measure, number | null>; rows: ScoreRow[] }

const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Every deployment against the median of all of them, measure by measure (owner, 2026-11-24: the comparator as a
 * scoreboard). Better is always positive (less latency, use and faults is better). Each measure is scaled to its own
 * widest gap, so the deployment furthest from the median draws a full bar and a near tie stays short. Score = measures
 * better than the median − measures worse; rows best first.
 */
export function scoreBoard(rows: CompareRow[]): ScoreBoard {
  const medians = Object.fromEntries(MEASURES.map((m) => [m, median(rows.map((r) => r.values[m]).filter((v): v is number => v !== null))])) as Record<Measure, number | null>
  const devOf = (r: CompareRow, m: Measure) => {
    const v = r.values[m]
    const md = medians[m]
    if (v === null || md === null) return 0
    const d = (v - md) * (BETTER_HIGH[m] ? 1 : -1)
    return Math.abs(d) < 1e-9 ? 0 : d
  }
  const widest = Object.fromEntries(MEASURES.map((m) => [m, Math.max(0, ...rows.map((r) => Math.abs(devOf(r, m))))])) as Record<Measure, number>
  const out = rows.map((r) => {
    let wins = 0
    let losses = 0
    const cells = Object.fromEntries(
      MEASURES.map((m) => {
        const v = r.values[m]
        const dev = devOf(r, m)
        if (v !== null && dev > 0) wins++
        if (v !== null && dev < 0) losses++
        const peers = rows.filter((x) => x.values[m] !== null)
        const rank = v === null ? 0 : 1 + peers.filter((x) => devOf(x, m) > dev).length
        return [m, { value: v, dev, norm: widest[m] ? dev / widest[m] : 0, rank, of: peers.length }]
      })
    ) as Record<Measure, ScoreCell>
    return { id: r.id, name: r.name, cells, wins, losses, score: wins - losses }
  })
  out.sort((a, b) => b.score - a.score || b.wins - a.wins || a.name.localeCompare(b.name, "es"))
  return { medians, rows: out }
}
