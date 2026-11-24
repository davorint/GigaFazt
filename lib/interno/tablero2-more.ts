/**
 * Tablero 2, second round (owner, 2026-11-22: "more graphs, way more impressive"). Pure figures from the synced records:
 *
 * - revenueStreams: monthly recurring revenue per plan per month (the streamgraph), at most four streams.
 * - statusFlows: how every client stood with Cobranza at each of the last months and how they moved between those
 *   states (the alluvial). A past month is read as of its 28th, the current one as of today.
 * - skyline: each deployment's towers with their apartments and the clients lit in them (penetration).
 * - lightRows + dodge: every ONT's light per deployment, with how much it dropped since its first reading (beeswarm).
 * - tenure: every client by the day they started, what they pay and whether they're still here (the spiral).
 * - repairLanes: the fault reports of the last days as bars from opened to fixed, packed into lanes (the Gantt).
 */
import { priceAt, type Client } from "../clients/model"
import { lightStatus, type LightStatus } from "../clients/optics"
import { ledger, monthOf, type Payment, type PayStatus } from "../payments/model"
import type { Report, ReportCategory } from "../reports/model"
import { siteLabel, type Site } from "../sites/model"
import { activeAt } from "./numbers"
import { liveOn } from "./tablero2"

// ── Revenue streams ─────────────────────────────────────────────────────────

/** "__tv" and "__otros" are named by the page; the rest are plan names as Clientes writes them. */
export type Streams = { keys: string[]; rows: { month: string; values: Record<string, number> }[] }

const speed = (p: string) => Number(/\d+/.exec(p)?.[0] ?? 0) * (/g/i.test(p) ? 1000 : 1)

/** Each live service's price that month, by plan (TV and other services apart); beyond four streams the smallest fold into "__otros". */
export function revenueStreams(clients: Client[], months: string[]): Streams {
  const keyOf = (type: string, plan: string) => (type === "internet" ? plan.trim() || "—" : type === "iptv" ? "__tv" : "__otros")
  const rows = months.map((month) => {
    const end = `${month}-31`
    const values: Record<string, number> = {}
    for (const c of clients)
      for (const s of c.services) {
        const live = (!s.start || s.start <= end) && (s.status !== "cancelado" || (!!s.cancelledAt && s.cancelledAt > end))
        const p = live ? (priceAt(s, month) ?? 0) : 0
        if (p > 0) values[keyOf(s.type, s.plan)] = (values[keyOf(s.type, s.plan)] ?? 0) + p
      }
    return { month, values }
  })
  const total = new Map<string, number>()
  for (const r of rows) for (const [k, v] of Object.entries(r.values)) total.set(k, (total.get(k) ?? 0) + v)
  const order = (a: string, b: string) => (a === "__otros" ? 1 : b === "__otros" ? -1 : a === "__tv" ? 1 : b === "__tv" ? -1 : speed(a) - speed(b) || a.localeCompare(b))
  let keys = [...total.keys()]
  if (keys.length > 4) {
    const keep = new Set(keys.filter((k) => k !== "__otros").sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0)).slice(0, 3))
    for (const r of rows) {
      const folded: Record<string, number> = {}
      for (const [k, v] of Object.entries(r.values)) {
        const to = keep.has(k) ? k : "__otros"
        folded[to] = (folded[to] ?? 0) + v
      }
      r.values = folded
    }
    keys = [...keep, "__otros"]
  }
  keys.sort(order)
  for (const r of rows) for (const k of keys) r.values[k] = Math.round((r.values[k] ?? 0) * 100) / 100
  return { keys, rows }
}

// ── Status flows (alluvial) ─────────────────────────────────────────────────

export const FLOW_STATES = ["al-corriente", "por-vencer", "atrasado", "sin-cobro", "baja"] as const
export type FlowState = (typeof FLOW_STATES)[number]
export type StatusFlows = { months: string[]; counts: Record<FlowState, number>[]; links: { from: number; a: FlowState; b: FlowState; n: number }[] }

/**
 * Each client's standing at every month in `months` (oldest first): its Cobranza status while it has a live service,
 * "baja" the month it left, then nothing. A client not yet with us is left out of that month.
 */
export function statusFlows(clients: Client[], payments: Payment[], months: string[], today: string): StatusFlows {
  const cur = monthOf(today)
  const byClient = new Map<string, Payment[]>()
  for (const p of payments) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p])
  const counts = months.map(() => Object.fromEntries(FLOW_STATES.map((s) => [s, 0])) as Record<FlowState, number>)
  const pair = new Map<string, number>()
  for (const c of clients) {
    const mine = byClient.get(c.id) ?? []
    let prev: FlowState | null = null
    months.forEach((m, i) => {
      const at = m === cur ? today : `${m}-28`
      // With service: how it stands; the month after its last one with service: "baja"; otherwise not counted.
      // The current month as of today: a scheduled install isn't a client yet.
      const on = m === cur ? c.services.some((s) => liveOn(s, today)) : activeAt(c, m)
      const st: FlowState | null = on ? (ledger(asOf(c, m), mine.filter((p) => p.date <= at), at).status as PayStatus) : prev && prev !== "baja" ? "baja" : null
      if (st) counts[i][st]++
      if (st && prev) pair.set(`${i - 1}|${prev}|${st}`, (pair.get(`${i - 1}|${prev}|${st}`) ?? 0) + 1)
      prev = st
    })
  }
  return {
    months,
    counts,
    links: [...pair].map(([k, n]) => {
      const [from, a, b] = k.split("|")
      return { from: Number(from), a: a as FlowState, b: b as FlowState, n }
    }),
  }
}

/** The client as it was at the end of `month`: a service cancelled later was still live then (so Cobranza charged it). */
function asOf(c: Client, month: string): Client {
  const end = `${month}-31`
  return { ...c, services: c.services.map((s) => (s.status === "cancelado" && s.cancelledAt > end ? { ...s, status: "activo" as const, cancelledAt: "" } : s)) }
}

/** Of those late at the next-to-last month, the share at "al-corriente" or "por-vencer" in the last one (null without any). */
export function recovered(f: StatusFlows): { late: number; share: number | null } {
  const i = f.months.length - 2
  if (i < 0) return { late: 0, share: null }
  const out = f.links.filter((l) => l.from === i && l.a === "atrasado")
  const late = out.reduce((a, l) => a + l.n, 0)
  const back = out.filter((l) => l.b === "al-corriente" || l.b === "por-vencer").reduce((a, l) => a + l.n, 0)
  return { late, share: late ? back / late : null }
}

// ── Skyline (penetration) ───────────────────────────────────────────────────

export type SkyTower = { id: string; name: string; floors: number; cols: number; apartments: number; lit: number; windows: number[] }
export type SkySite = { id: string; name: string; apartments: number; active: number; unassigned: number; towers: SkyTower[] }

/** A small deterministic shuffle (same tower, same windows lit on every visit). */
function shuffled(n: number, seed: string): number[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    const j = (h >>> 0) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Deployments with apartments, their towers drawn as buildings: a window per apartment (floors × columns), one window
 * lit per active client of that tower (not their actual apartment). With one tower, every active client of the site is
 * in it; with several, clients without a tower are counted apart (`unassigned`). Active = an active service live today.
 */
export function skyline(sites: Site[], clients: Client[], today: string): SkySite[] {
  return sites
    .map((s) => {
      const mine = clients.filter((c) => c.siteId === s.id && c.services.some((x) => x.status === "activo" && liveOn(x, today)))
      const towers = s.towers.filter((t) => (t.apartments ?? 0) > 0)
      const known = new Set(towers.map((t) => t.id))
      const loose = towers.length === 1 ? 0 : mine.filter((c) => !known.has(c.towerId)).length
      return {
        id: s.id,
        name: siteLabel(s),
        apartments: towers.reduce((a, t) => a + (t.apartments ?? 0), 0),
        active: mine.length,
        unassigned: loose,
        towers: towers.map((t, i) => {
          const apartments = t.apartments ?? 0
          const floors = t.floors && t.floors > 0 ? Math.min(t.floors, apartments) : Math.max(1, Math.round(Math.sqrt(apartments * 1.6)))
          const cols = Math.ceil(apartments / floors)
          const lit = Math.min(apartments, towers.length === 1 ? mine.length : mine.filter((c) => c.towerId === t.id).length)
          return { id: t.id, name: t.name.trim() || `Torre ${i + 1}`, floors, cols, apartments, lit, windows: shuffled(apartments, t.id).slice(0, lit) }
        }),
      }
    })
    .filter((s) => s.apartments > 0)
    .sort((a, b) => b.active / b.apartments - a.active / a.apartments)
}

// ── Light (beeswarm) ────────────────────────────────────────────────────────

export type LightDot = { id: string; rx: number; status: LightStatus; drop: number | null; first: number | null; place: string; plan: string }
export type LightRow = { id: string; name: string; dots: LightDot[] }

/** Live internet services with a light reading, per deployment ("" = none), and the drop since their oldest reading. */
export function lightRows(sites: Site[], clients: Client[]): LightRow[] {
  const known = new Map(sites.map((s) => [s.id, s]))
  const by = new Map<string, LightDot[]>()
  for (const c of clients)
    for (const s of c.services) {
      if (s.type !== "internet" || s.status === "cancelado" || s.rxDbm === null) continue
      const first = s.rxHistory[0]?.rx ?? null
      const key = known.has(c.siteId) ? c.siteId : ""
      const dot: LightDot = { id: s.id, rx: s.rxDbm, status: lightStatus(s.rxDbm) as LightStatus, first, drop: first === null ? null : Math.round((first - s.rxDbm) * 10) / 10, place: [c.tower, c.apartment].filter(Boolean).join(" · "), plan: s.plan.trim() }
      by.set(key, [...(by.get(key) ?? []), dot])
    }
  return [...by]
    .map(([id, dots]) => ({ id, name: id ? siteLabel(known.get(id) as Site) : "", dots: dots.sort((a, b) => a.rx - b.rx) }))
    .sort((a, b) => b.dots.length - a.dots.length || a.name.localeCompare(b.name, "es"))
}

/** Beeswarm: for circles at `xs` (px) with radius `r`, a vertical offset each so none overlap, as close to 0 as possible. */
export function dodge(xs: number[], r: number): number[] {
  const d = r * 2 + 1
  const placed: { x: number; y: number }[] = []
  const out = Array.from({ length: xs.length }, () => 0)
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  for (const [x, i] of order) {
    const near = placed.filter((p) => Math.abs(p.x - x) < d)
    let best = 0
    for (let k = 0; ; k++) {
      const y = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 0.9)
      if (near.every((p) => Math.hypot(p.x - x, p.y - y) >= d)) {
        best = y
        break
      }
    }
    placed.push({ x, y: best })
    out[i] = best
  }
  return out
}

// ── Tenure (spiral) ─────────────────────────────────────────────────────────

export type Star = { id: string; start: string; monthly: number; live: boolean; plan: string; site: string; months: number }

/** Every client by its first service's start (oldest first): what it pays now (or paid before leaving), still here or not. */
export function tenure(clients: Client[], sites: Site[], today: string): Star[] {
  const names = new Map(sites.map((s) => [s.id, siteLabel(s)]))
  const out: Star[] = []
  for (const c of clients) {
    const start = c.services.map((s) => s.start).filter(Boolean).sort()[0]
    if (!start || start > today) continue
    const live = c.services.some((s) => liveOn(s, today))
    const pick = c.services.filter((s) => (live ? liveOn(s, today) : true))
    const monthly = pick.reduce((a, s) => a + (s.monthly ?? 0), 0)
    const end = live ? today : (c.services.map((s) => s.cancelledAt).filter(Boolean).sort().at(-1) ?? today)
    const months = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / (30.44 * 864e5)))
    out.push({ id: c.id, start, monthly, live, plan: pick.find((s) => s.type === "internet")?.plan.trim() ?? "", site: names.get(c.siteId) ?? "", months })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

// ── Repairs (Gantt) ─────────────────────────────────────────────────────────

export const REPAIR_GROUPS = ["sin-servicio", "lento", "wifi", "otro"] as const
export type RepairGroup = (typeof REPAIR_GROUPS)[number]
const GROUP_OF: Record<ReportCategory, RepairGroup> = { "sin-servicio": "sin-servicio", lento: "lento", intermitente: "lento", wifi: "wifi", equipo: "wifi", tv: "otro", otro: "otro" }

export type RepairBar = { id: string; start: number; end: number; open: boolean; group: RepairGroup; lane: number; site: string; hours: number }

/** Reports that were open at some point of the last `days` days (discarded ones left out), packed into the fewest lanes. */
export function repairLanes(reports: Report[], sites: Site[], now: number, days = 60): { bars: RepairBar[]; lanes: number; from: number; median: number | null } {
  const from = now - days * 864e5
  const names = new Map(sites.map((s) => [s.id, siteLabel(s)]))
  const items = reports
    .filter((r) => r.status !== "descartado" && r.createdAt)
    .map((r) => {
      const start = Date.parse(r.createdAt)
      const open = r.status !== "resuelto"
      const end = open || !r.resolvedAt ? now : Math.max(start, Date.parse(r.resolvedAt))
      return { id: r.id, start, end, open, group: GROUP_OF[r.category] ?? "otro", lane: 0, site: names.get(r.siteId) ?? "", hours: (end - start) / 3600000 }
    })
    .filter((b) => Number.isFinite(b.start) && b.end >= from && b.start <= now)
    .sort((a, b) => a.start - b.start)
  const ends: number[] = []
  const gap = 6 * 3600000
  for (const b of items) {
    let lane = ends.findIndex((e) => e + gap <= Math.max(b.start, from))
    if (lane < 0) lane = ends.push(0) - 1
    ends[lane] = b.end
    b.lane = lane
  }
  const solved = items.filter((b) => !b.open).map((b) => b.hours).sort((a, b) => a - b)
  const median = solved.length ? (solved.length % 2 ? solved[(solved.length - 1) / 2] : (solved[solved.length / 2 - 1] + solved[solved.length / 2]) / 2) : null
  return { bars: items, lanes: ends.length, from, median }
}
