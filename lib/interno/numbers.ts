/**
 * The business numbers month by month (/interno/admin/numeros, owner 2026-11-19), from the same records the other
 * sections sync: what was collected and what the services charged, new and cancelled services, active clients, revenue
 * per client, the reports, and the profit of each location.
 *
 * - Expected: what the clients' services charge that month (payments/model chargeFor: from the month after the start,
 *   cancelled ones until their cancellation, each month at its price).
 * - Collected: payments dated that month (a payment covers any month; this is cash in).
 * - Active clients: with a service started before the month ended and not cancelled before it (cancellations without a
 *   date count from the start of the records, as Cobranza does).
 */
import type { Client } from "../clients/model"
import { addMonths, chargeFor, ledger, monthOf, type Payment } from "../payments/model"
import { hoursToSolve, type Report } from "../reports/model"
import { siteCost, siteLabel, linksCost, siteProfit, unpricedLinks, type Site } from "../sites/model"
import { clientStatus, lightDrop, monthlyTotal, type CancelReason } from "../clients/model"
import { lightStatus } from "../clients/optics"

export type MonthNumbers = {
  month: string
  expected: number
  collected: number
  /** collected / expected (null when nothing was expected). */
  rate: number | null
  newServices: number
  cancelled: number
  activeClients: number
  /** expected / active clients (null without active clients). */
  arpu: number | null
  reportsOpened: number
  reportsResolved: number
  /** Average hours to solve the reports resolved that month. */
  avgHours: number | null
}

/** The last `n` months up to `current` (yyyy-mm), oldest first. */
export const lastMonths = (current: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(current, i - n + 1))

/** Whether a client had a live service at the end of a month. */
function activeAt(c: Client, month: string): boolean {
  const end = `${month}-31`
  return c.services.some((s) => (!s.start || s.start <= end) && (s.status !== "cancelado" || (!!s.cancelledAt && s.cancelledAt > end)))
}

export function monthNumbers(clients: Client[], payments: Payment[], reports: Report[], months: string[]): MonthNumbers[] {
  return months.map((month) => {
    const expected = clients.reduce((a, c) => a + chargeFor(c, month), 0)
    const collected = payments.filter((p) => monthOf(p.date) === month).reduce((a, p) => a + p.amount, 0)
    const services = clients.flatMap((c) => c.services)
    const activeClients = clients.filter((c) => activeAt(c, month)).length
    const resolved = reports.filter((r) => r.status === "resuelto" && r.resolvedAt.slice(0, 7) === month)
    const hours = resolved.map(hoursToSolve).filter((h): h is number => h !== null)
    return {
      month,
      expected: Math.round(expected * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      rate: expected > 0 ? collected / expected : null,
      newServices: services.filter((s) => s.start.slice(0, 7) === month).length,
      cancelled: services.filter((s) => s.status === "cancelado" && s.cancelledAt.slice(0, 7) === month).length,
      activeClients,
      arpu: activeClients ? expected / activeClients : null,
      reportsOpened: reports.filter((r) => r.createdAt.slice(0, 7) === month).length,
      reportsResolved: resolved.length,
      avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    }
  })
}

export type SiteNumbers = {
  id: string
  name: string
  clients: number
  /** Clients with an active service, the building's apartments, and active ÷ apartments (null without apartments). */
  active: number
  apartments: number
  penetration: number | null
  income: number
  building: number
  links: number
  profit: number
  unpricedLinks: number
}

/**
 * Each location's month today: its clients' active services against the building and its internet links, and its
 * penetration (clients with an active service ÷ apartments). Least profitable first.
 */
export function siteNumbers(sites: Site[], clients: Client[]): SiteNumbers[] {
  return sites
    .map((s) => {
      const mine = clients.filter((c) => c.siteId === s.id)
      const income = mine.reduce((a, c) => a + monthlyTotal(c), 0)
      const active = mine.filter((c) => clientStatus(c) === "activo").length
      const apartments = s.towers.reduce((a, t) => a + (t.apartments ?? 0), 0)
      return { id: s.id, name: siteLabel(s), clients: mine.length, active, apartments, penetration: apartments ? active / apartments : null, income, building: siteCost(s), links: linksCost(s), profit: siteProfit(s, income), unpricedLinks: unpricedLinks(s) }
    })
    .sort((a, b) => a.profit - b.profit)
}

// ── Churn ───────────────────────────────────────────────────────────────────

/** Cancelled services per month ÷ active clients at the end of the month before (null without active clients). */
export function churnRate(rows: MonthNumbers[], i: number): number | null {
  const before = rows[i - 1]?.activeClients ?? 0
  return before ? rows[i].cancelled / before : null
}

/** Why services were cancelled in the given months, most common first ("" = not recorded). */
export function cancelReasons(clients: Client[], months: string[]): { reason: CancelReason; n: number }[] {
  const count = new Map<CancelReason, number>()
  for (const c of clients) for (const s of c.services) if (s.status === "cancelado" && months.includes(s.cancelledAt.slice(0, 7))) count.set(s.cancelReason, (count.get(s.cancelReason) ?? 0) + 1)
  return [...count].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n)
}

// ── Clients at risk ─────────────────────────────────────────────────────────

export type RiskReason = "atrasado" | "promesa" | "reportes" | "luz"
export type AtRisk = { client: Client; reasons: RiskReason[]; owed: number }

/** Reports in this many days that make a client "with repeated problems". */
const REPORT_DAYS = 60
const REPORTS_FOR_RISK = 2

/**
 * Clients with an active service who may leave (owner, 2026-11-19), to call before they cancel: late on a payment, a
 * payment promise past its date, REPORTS_FOR_RISK or more reports in REPORT_DAYS days, or weak or falling light (below
 * the ONT's margin, or 2 dB or more lost since the first reading). Most reasons first, then the most owed.
 */
export function clientsAtRisk(clients: Client[], payments: Payment[], reports: Report[], today: string): AtRisk[] {
  const since = Date.parse(`${today}T00:00:00Z`) - REPORT_DAYS * 864e5
  const out: AtRisk[] = []
  for (const c of clients) {
    if (clientStatus(c) !== "activo") continue
    const l = ledger(c, payments, today)
    const reasons: RiskReason[] = []
    if (l.status === "atrasado") reasons.push("atrasado")
    if (c.promiseDate && c.promiseDate < today && l.owed > 0) reasons.push("promesa")
    if (reports.filter((r) => r.clientId === c.id && Date.parse(r.createdAt) >= since).length >= REPORTS_FOR_RISK) reasons.push("reportes")
    const net = c.services.filter((s) => s.type === "internet" && s.status === "activo")
    if (net.some((s) => lightStatus(s.rxDbm) === "baja" || (lightDrop(s) ?? 0) >= 2)) reasons.push("luz")
    if (reasons.length) out.push({ client: c, reasons, owed: l.owed })
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || b.owed - a.owed)
}
