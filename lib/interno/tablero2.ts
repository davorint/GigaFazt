/**
 * Tablero 2's figures (owner, 2026-11-22: a new iteration of the Tablero drawn with D3). Pure, from the same synced
 * records as the Tablero:
 *
 * - moneyFlow: today's recurring income (the same as the MRR: live services at this month's dated price) from each plan into each deployment, and out of it the building (rent,
 *   power), the links (carriers) and what's left. A deployment that loses money gets the missing amount from a
 *   "Faltante" source, so every band is a real amount (a Sankey can't draw negatives).
 * - mrrBridge: monthly recurring revenue (priced live services, dated prices) at the end of the month before the period
 *   and at its last month, split per client into new, more, less and lost.
 * - cohorts: clients by the month of their first service, and the share still with service each month after.
 * - networkRings: every deployment around the core, each a disc of its clients colored by how they stand (Cobranza).
 * - payCalendar: payments per day for the last weeks, and which days of the month people pay.
 */
import { addDays } from "../agenda/model"
import { priceAt, type Client, type Service } from "../clients/model"
import { addMonths, monthOf, type Payment } from "../payments/model"
import { linksCost, siteCost, siteLabel, type Site } from "../sites/model"
import { activeAt } from "./numbers"

const round = (n: number) => Math.round(n * 100) / 100

/**
 * A service live on `date`: started by then (a scheduled install isn't yet) and not cancelled by then. Suspended
 * services are live: Cobranza still charges them. Every Tablero 2 figure "now" goes through this.
 */
export const liveOn = (s: Pick<Service, "start" | "status" | "cancelledAt">, date: string) => (!s.start || s.start <= date) && (s.status !== "cancelado" || (!!s.cancelledAt && s.cancelledAt > date))

// ── Money flow (Sankey) ─────────────────────────────────────────────────────

export type FlowKind = "plan" | "tv" | "otros" | "faltante" | "site" | "nosite" | "edificio" | "enlaces" | "utilidad"
export type FlowNode = { id: string; kind: FlowKind; label: string }
export type FlowLink = { source: string; target: string; value: number }
export type MoneyFlow = { nodes: FlowNode[]; links: FlowLink[]; income: number; costs: number; profit: number }

/** `label` is the plan or deployment name; the other kinds are named by the page (its copy). */
export function moneyFlow(sites: Site[], clients: Client[], today: string): MoneyFlow {
  const month = monthOf(today)
  const known = new Map(sites.map((s) => [s.id, s]))
  const links = new Map<string, number>()
  const nodes = new Map<string, FlowNode>()
  const add = (source: FlowNode, target: FlowNode, value: number) => {
    if (value <= 0) return
    nodes.set(source.id, source)
    nodes.set(target.id, target)
    const key = `${source.id}\u0000${target.id}`
    links.set(key, (links.get(key) ?? 0) + value)
  }
  const siteNode = (c: Client): FlowNode => {
    const s = known.get(c.siteId)
    return s ? { id: `s:${s.id}`, kind: "site", label: siteLabel(s) } : { id: "s:", kind: "nosite", label: "" }
  }
  let income = 0
  const inSite = new Map<string, number>()
  for (const c of clients)
    for (const s of c.services) {
      const price = liveOn(s, today) ? (priceAt(s, month) ?? 0) : 0
      if (price <= 0) continue
      const src: FlowNode = s.type === "internet" ? { id: `p:${s.plan.trim() || "—"}`, kind: "plan", label: s.plan.trim() || "—" } : s.type === "iptv" ? { id: "p:tv", kind: "tv", label: "" } : { id: "p:otros", kind: "otros", label: "" }
      const dst = siteNode(c)
      add(src, dst, price)
      income += price
      inSite.set(dst.id, (inSite.get(dst.id) ?? 0) + price)
    }
  let costs = 0
  let profit = 0
  const outs = { edificio: { id: "c:edificio", kind: "edificio", label: "" }, enlaces: { id: "c:enlaces", kind: "enlaces", label: "" }, utilidad: { id: "c:utilidad", kind: "utilidad", label: "" } } as const
  const short: FlowNode = { id: "p:faltante", kind: "faltante", label: "" }
  for (const s of sites) {
    const node: FlowNode = { id: `s:${s.id}`, kind: "site", label: siteLabel(s) }
    const inc = inSite.get(node.id) ?? 0
    const building = siteCost(s)
    const carriers = linksCost(s)
    if (!inc && !building && !carriers) continue
    const left = inc - building - carriers
    if (left < 0) add(short, node, -left)
    add(node, outs.edificio, building)
    add(node, outs.enlaces, carriers)
    add(node, outs.utilidad, left)
    costs += building + carriers
    profit += left
  }
  // Income from clients without a deployment has no costs here: all of it is left over.
  const loose = inSite.get("s:") ?? 0
  if (loose) {
    add({ id: "s:", kind: "nosite", label: "" }, outs.utilidad, loose)
    profit += loose
  }
  return {
    nodes: [...nodes.values()],
    links: [...links].map(([k, value]) => {
      const [source, target] = k.split("\u0000")
      return { source, target, value: round(value) }
    }),
    income: round(income),
    costs: round(costs),
    profit: round(profit),
  }
}

// ── MRR bridge (waterfall) ──────────────────────────────────────────────────

/** What a client's live services charge per month on `until` (the end of `month` unless given: today for the current one; dated prices; unpriced count as 0). */
export function mrrAt(c: Client, month: string, until = `${month}-31`): number {
  return c.services.reduce((a, s) => (liveOn(s, until) ? a + (priceAt(s, month) ?? 0) : a), 0)
}

export type Bridge = { from: string; to: string; start: number; added: number; more: number; less: number; lost: number; end: number; counts: Record<"added" | "more" | "less" | "lost", number> }

/** From the end of `from` to `toDate` (the end of `to` unless given: today), each client's change put in one bucket. start + added + more − less − lost = end. */
export function mrrBridge(clients: Client[], from: string, to: string, toDate = `${to}-31`): Bridge {
  const b: Bridge = { from, to, start: 0, added: 0, more: 0, less: 0, lost: 0, end: 0, counts: { added: 0, more: 0, less: 0, lost: 0 } }
  for (const c of clients) {
    const a = mrrAt(c, from)
    const z = mrrAt(c, to, toDate)
    b.start += a
    b.end += z
    const key = !a && z ? "added" : a && !z ? "lost" : z > a ? "more" : z < a ? "less" : null
    if (!key) continue
    b[key] += Math.abs(z - a)
    b.counts[key]++
  }
  for (const k of ["start", "added", "more", "less", "lost", "end"] as const) b[k] = round(b[k])
  return b
}

// ── Cohorts ─────────────────────────────────────────────────────────────────

export type Cohort = { month: string; size: number; cells: (number | null)[] }

/**
 * Clients grouped by the month of their first service (within `months`), and for each month after (0 = that month) the
 * share with a live service at its end (the current month: on `today`); null past `months`' last month (it hasn't
 * happened). A client whose first service starts after `today` (a scheduled install) isn't in any cohort yet.
 */
export function cohorts(clients: Client[], months: string[], today = `${months[months.length - 1]}-31`): Cohort[] {
  const last = months[months.length - 1]
  const by = new Map<string, Client[]>()
  for (const c of clients) {
    const first = c.services.map((s) => s.start).filter(Boolean).sort()[0]
    if (!first || first > today || !months.includes(first.slice(0, 7))) continue
    const m = first.slice(0, 7)
    by.set(m, [...(by.get(m) ?? []), c])
  }
  return months.map((month) => {
    const group = by.get(month) ?? []
    const cells = months.map((_, k) => {
      const at = addMonths(month, k)
      if (at > last) return null
      return group.length ? group.filter((c) => (at === monthOf(today) ? c.services.some((s) => liveOn(s, today)) : activeAt(c, at))).length / group.length : null
    })
    return { month, size: group.length, cells }
  })
}

/** The share still with service `k` months after joining, over all cohorts old enough (weighted by size). */
export function retentionAt(rows: Cohort[], k: number): number | null {
  let n = 0
  let kept = 0
  for (const r of rows) {
    const v = r.cells[k]
    if (v === null || v === undefined || !r.size) continue
    n += r.size
    kept += v * r.size
  }
  return n ? kept / n : null
}

// ── How each client stands (Cobranza) ──────────────────────────────────────────────────

export const TONES = ["al-corriente", "por-vencer", "atrasado", "suspendido", "sin-cobro"] as const
export type Tone = (typeof TONES)[number]

// ── Payment calendar ────────────────────────────────────────────────────────

export type PayDay = { day: string; n: number; amount: number }

/** Every day from the Monday `weeks` weeks back through today, with its payments; and payments per day of the month. */
export function payCalendar(payments: Payment[], today: string, weeks = 26): { days: PayDay[]; byDayOfMonth: number[]; total: number } {
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7
  const first = addDays(today, -dow - (weeks - 1) * 7)
  const m = new Map<string, PayDay>()
  const days: PayDay[] = []
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const x = { day: d, n: 0, amount: 0 }
    m.set(d, x)
    days.push(x)
  }
  const byDayOfMonth = Array.from({ length: 31 }, () => 0)
  let total = 0
  for (const p of payments) {
    const x = m.get(p.date)
    if (!x) continue
    x.n++
    x.amount = round(x.amount + p.amount)
    byDayOfMonth[Number(p.date.slice(8, 10)) - 1]++
    total++
  }
  return { days, byDayOfMonth, total }
}

/**
 * The shortest run of days of the month that holds at least `share` of the payments (null without payments). The run
 * may cross the month's end (from 28 to 5: `from` > `to`), since people who pay early pay at the end of the month
 * before; on a tie the run inside one month wins.
 */
export function payWindow(byDayOfMonth: number[], share = 0.6): { from: number; to: number; share: number } | null {
  const total = byDayOfMonth.reduce((a, b) => a + b, 0)
  if (!total) return null
  let best: { from: number; to: number; share: number; len: number } | null = null
  for (let i = 0; i < 31; i++) {
    let sum = 0
    for (let j = i; j < i + 31; j++) {
      sum += byDayOfMonth[j % 31]
      if (sum / total >= share) {
        const len = j - i
        const wraps = j >= 31
        if (!best || len < best.len || (len === best.len && !wraps && best.from > best.to)) best = { from: i + 1, to: (j % 31) + 1, share: sum / total, len }
        break
      }
    }
  }
  return best && { from: best.from, to: best.to, share: best.share }
}
