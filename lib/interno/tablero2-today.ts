/**
 * Tablero 2, "Hoy" (owner, 2026-11-24: "how many online payments today, how many bank transfers; the tickets: the open
 * ones, the pending ones and the number of tickets in the month"). Pure figures from the synced records:
 *
 * - paymentsByDay: payments per day and channel for the last days. Channels don't overlap: "linea" is what came
 *   through the client portal (Stripe: card, OXXO or SPEI; its SPEI is a bank transfer too, but it is counted here
 *   once, as online), "transferencia" the transfers the office registers, "otros" cash, deposits and the rest.
 * - ticketFigures: the reports (tickets) open now by stage — "nuevo" is pending, nobody has taken it yet — the oldest
 *   open one, and the month's reports per day of the month split by how they stand now.
 */
import { addDays } from "../agenda/model"
import type { Payment } from "../payments/model"
import { isOpen, type Report } from "../reports/model"

export const CHANNELS = ["linea", "transferencia", "otros"] as const
export type Channel = (typeof CHANNELS)[number]
export const ONLINE_KINDS = ["tarjeta", "oxxo", "spei"] as const
export type OnlineKind = (typeof ONLINE_KINDS)[number]

/**
 * How a payment came in. The portal's payments are written by the Stripe webhook with an id "stripe-…" and the
 * reference "Stripe …"; their method says which (tarjeta = card, efectivo = OXXO, transferencia = SPEI).
 */
export function channelOf(p: Pick<Payment, "id" | "reference" | "method">): { channel: Channel; online: OnlineKind | null } {
  if (p.id.startsWith("stripe-") || p.reference.startsWith("Stripe ")) return { channel: "linea", online: p.method === "transferencia" ? "spei" : p.method === "efectivo" ? "oxxo" : "tarjeta" }
  return { channel: p.method === "transferencia" ? "transferencia" : "otros", online: null }
}

export type Tally = { n: number; amount: number }
export type PayDay = { day: string; by: Record<Channel, Tally>; total: Tally }
const tally = (): Tally => ({ n: 0, amount: 0 })
const add = (t: Tally, amount: number) => {
  t.n++
  t.amount = Math.round((t.amount + amount) * 100) / 100
}

/** The last `days` days through today, each with its payments per channel; and today's online payments per kind. */
export function paymentsByDay(payments: Payment[], today: string, days = 14): { days: PayDay[]; online: Record<OnlineKind, Tally> } {
  const list: PayDay[] = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i - days + 1), by: { linea: tally(), transferencia: tally(), otros: tally() }, total: tally() }))
  const at = new Map(list.map((d) => [d.day, d]))
  const online = { tarjeta: tally(), oxxo: tally(), spei: tally() }
  for (const p of payments) {
    const d = at.get(p.date)
    if (!d) continue
    const c = channelOf(p)
    add(d.by[c.channel], p.amount)
    add(d.total, p.amount)
    if (p.date === today && c.online) add(online[c.online], p.amount)
  }
  return { days: list, online }
}

// ── Tickets ─────────────────────────────────────────────────────────────────

/** Open stages, the one waiting for someone first. */
export const OPEN_STAGES = ["nuevo", "en-proceso", "visita"] as const
export type OpenStage = (typeof OPEN_STAGES)[number]
/** How a report opened this month stands now. */
export const MONTH_STATES = ["abierto", "resuelto", "descartado"] as const
export type MonthState = (typeof MONTH_STATES)[number]

/** The day (YYYY-MM-DD) an ISO instant falls on in Mexico City. */
export const dayInMexico = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso))

export type TicketFigures = {
  open: Record<OpenStage, number> & { total: number }
  /** Hours the oldest open report has been open (null with none open). */
  oldestHours: number | null
  /** Open reports older than 48 hours. */
  stale: number
  month: Record<MonthState, number> & { total: number }
  /** Reports opened last month up to the same day of the month (a fair comparison while the month runs). */
  lastMonthSoFar: number
  /** Every day of this month: reports opened that day, by how they stand now (days after today are empty). */
  days: { day: string; by: Record<MonthState, number>; future: boolean }[]
}

export function ticketFigures(reports: Report[], today: string, now: number): TicketFigures {
  const month = today.slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = Array.from({ length }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, "0")}`
    return { day, by: { abierto: 0, resuelto: 0, descartado: 0 }, future: day > today }
  })
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
  const prevCut = `${prev}-${today.slice(8, 10)}`
  const open = { nuevo: 0, "en-proceso": 0, visita: 0, total: 0 }
  const tot = { abierto: 0, resuelto: 0, descartado: 0, total: 0 }
  let oldest: number | null = null
  let stale = 0
  let lastMonthSoFar = 0
  for (const r of reports) {
    const t = Date.parse(r.createdAt)
    // Open counts every open report, even one whose date is unreadable (it just has no age and no day).
    if (isOpen(r)) {
      open[r.status as OpenStage]++
      open.total++
      if (Number.isFinite(t)) {
        const hours = Math.max(0, (now - t) / 3600000)
        oldest = Math.max(oldest ?? 0, hours)
        if (hours > 48) stale++
      }
    }
    if (!Number.isFinite(t)) continue
    const day = dayInMexico(r.createdAt)
    if (day.startsWith(prev) && day <= prevCut) lastMonthSoFar++
    if (!day.startsWith(month)) continue
    const state: MonthState = isOpen(r) ? "abierto" : r.status === "descartado" ? "descartado" : "resuelto"
    days[Number(day.slice(8, 10)) - 1].by[state]++
    tot[state]++
    tot.total++
  }
  return { open, oldestHours: oldest, stale, month: tot, lastMonthSoFar, days }
}
