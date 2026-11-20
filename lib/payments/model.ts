/**
 * Payments (Clientes → Cobranza, owner 2026-11-18: "do 9"; billing stays manual, no Wisphub).
 *
 * A payment is what a client paid on a date (amount with IVA, method, reference). What each client owes comes from
 * its services; payments are applied to the oldest month first, so paying three months at once leaves the next two
 * covered and a partial payment leaves the rest owed.
 *
 * The rules (owner, 2026-11-19):
 * - Service is paid in advance: every month's invoice is cut on day 1 and is due that day, for everyone.
 * - The client has GRACE_DAYS (10) to pay it; after that the month is late and the service is cut (the MikroTik
 *   "Morosos" list).
 * - The installation month: installed on or before day FREE_AFTER_DAY (15), it is charged, due on the installation
 *   day; installed after the 15th, it's free and the first invoice is the next month's.
 * - A cancelled service keeps owing the months whose invoice (day 1) came before its cancellation date (one cancelled
 *   without a date, from before dates were kept, no longer counts). Each month is charged at the price the service had
 *   then (its price history), so a price change doesn't rewrite past months.
 */
import { priceAt, type Client, type Service } from "../clients/model"
import { newId } from "../survey/id"
import { csvCell } from "../csv"

export const PAYMENT_METHODS = ["efectivo", "transferencia", "deposito", "tarjeta", "otro"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type Payment = {
  id: string
  clientId: string
  /** YYYY-MM-DD. */
  date: string
  /** MXN with IVA. */
  amount: number
  method: PaymentMethod
  /** Transfer reference, receipt number… */
  reference: string
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

/** Days after the invoice is due before a month counts as late (and the service is cut). */
export const GRACE_DAYS = 10
/** Installed after this day of the month: that month is free. */
export const FREE_AFTER_DAY = 15
/** Days before the payment day when a month shows as coming due. */
export const SOON_DAYS = 5

export function newPayment(p: Partial<Payment> = {}): Payment {
  return { id: newId(), clientId: "", date: "", amount: 0, method: "efectivo", reference: "", notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

// ── Months ───────────────────────────────────────────────────────────────

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
export const monthOf = (date: string) => date.slice(0, 7)
export const isMonth = (m: string) => MONTH.test(m)

export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number)
  const i = y * 12 + (mo - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
}

/** Every month from `from` to `to`, both included (empty when `from` is after `to`). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to && out.length < 600; m = addMonths(m, 1)) out.push(m)
  return out
}

/** The invoice of a month is cut on day 1 and due that day (prepaid service). */
export const dueDate = (month: string) => `${month}-01`

/** A service's installation month is charged: installed on or before day FREE_AFTER_DAY. */
export const installMonthCharged = (start: string) => Number(start.slice(8, 10)) <= FREE_AFTER_DAY

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

// ── What a client owes ───────────────────────────────────────────────────

/** Monthly charge: active and suspended services with a price (cancelled ones stop counting). */
export const monthlyDue = (c: Client) => c.services.filter((s) => s.status !== "cancelado").reduce((a, s) => a + (s.monthly ?? 0), 0)

/**
 * Whether a service is charged for a month: from its installation month when installed by the 15th (else from the next
 * month), and while not cancelled (or, cancelled, for months whose invoice came before the cancellation).
 */
export function chargedIn(s: Service, month: string): boolean {
  if (!priceAt(s, month)) return false
  if (s.start) {
    const first = monthOf(s.start)
    if (month < first || (month === first && !installMonthCharged(s.start))) return false
  }
  if (s.status !== "cancelado") return true
  return !!s.cancelledAt && dueDate(month) < s.cancelledAt
}

/** What a month costs: the services charged that month. */
export const chargeFor = (c: Client, month: string) => c.services.filter((s) => chargedIn(s, month)).reduce((a, s) => a + (priceAt(s, month) ?? 0), 0)

/**
 * When a month's invoice is due for a client: day 1, except a month whose only charges are services installed in it
 * (by the 15th): then the installation day (the client pays when it's installed, not before).
 */
export function monthDue(c: Client, month: string): string {
  const charged = c.services.filter((s) => chargedIn(s, month))
  const installs = charged.filter((s) => s.start && monthOf(s.start) === month).map((s) => s.start)
  return installs.length && installs.length === charged.length ? installs.sort()[0] : dueDate(month)
}

export function billingStart(c: Client, payments: Payment[], today: string): string {
  if (isMonth(c.billingFrom)) return c.billingFrom
  const mine = payments.filter((p) => p.clientId === c.id && p.date).map((p) => monthOf(p.date))
  let start = [monthOf(today), ...mine].sort()[0]
  const firstService = c.services.map((s) => s.start).filter(Boolean).sort()[0]
  if (firstService && monthOf(firstService) > start) start = monthOf(firstService)
  return start
}

export type PayStatus = "atrasado" | "por-vencer" | "al-corriente" | "sin-cobro"

export type MonthLine = { month: string; due: string; charge: number; paid: number }

export type Ledger = {
  monthly: number
  start: string
  months: MonthLine[]
  paidTotal: number
  /** Unpaid amount of months whose payment day has come. */
  owed: number
  /** Months past their grace period and not fully paid. */
  lateMonths: string[]
  status: PayStatus
  /** Last month fully paid ("" when none). */
  coveredUntil: string
  /** Paid beyond the current month that doesn't make a whole month. */
  credit: number
  lastPayment: Payment | null
  /** The next payment day to watch: the oldest unpaid month's, else the first charged month after what's covered ("" = none). */
  nextDue: string
}

/**
 * The client's months from its billing start to the current one, with the payments applied oldest month first, and
 * its status: late (a month past its payment day + grace is unpaid), coming due (this month unpaid, its payment day
 * within SOON_DAYS or within the grace), paid up, or nothing to charge (no priced service and nothing owed).
 */
export function ledger(c: Client, all: Payment[], today: string): Ledger {
  const payments = all.filter((p) => p.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
  const monthly = monthlyDue(c)
  const start = billingStart(c, all, today)
  const current = monthOf(today)
  const paidTotal = payments.reduce((a, p) => a + p.amount, 0)
  let left = paidTotal
  const months: MonthLine[] = monthsBetween(start, current).map((month) => {
    const charge = chargeFor(c, month)
    const paid = Math.min(left, charge)
    left -= paid
    return { month, due: monthDue(c, month), charge, paid }
  })
  let coveredUntil = ""
  for (const m of months) {
    if (m.charge - m.paid > 0.005) break
    if (m.charge > 0) coveredUntil = m.month
  }
  // Whole months paid ahead (at the charge each of those months will have).
  const allPaid = months.every((m) => m.charge - m.paid <= 0.005)
  let ahead = current
  if (allPaid)
    for (let i = 0; i < 120; i++) {
      ahead = addMonths(ahead, 1)
      const charge = chargeFor(c, ahead)
      if (charge <= 0) {
        if (!c.services.some((s) => s.status !== "cancelado" && s.monthly)) break
        continue
      }
      if (left < charge - 0.005) break
      coveredUntil = ahead
      left -= charge
    }
  const unpaid = months.filter((m) => m.charge - m.paid > 0.005)
  const owed = unpaid.filter((m) => m.due <= today).reduce((a, m) => a + m.charge - m.paid, 0)
  // Due on day 1: the 10th is the last day to pay, the 11th it's late (10 days after the due date).
  const lateMonths = unpaid.filter((m) => daysBetween(m.due, today) >= GRACE_DAYS).map((m) => m.month)
  const thisMonth = unpaid.find((m) => m.month === current)
  const status: PayStatus = lateMonths.length
    ? "atrasado"
    : thisMonth && daysBetween(today, thisMonth.due) <= SOON_DAYS
      ? "por-vencer"
      : monthly <= 0 && owed <= 0
        ? "sin-cobro"
        : "al-corriente"
  // The next payment day: the oldest unpaid month's, else the first month after the covered ones that has a charge.
  let nextDue = unpaid[0]?.due ?? ""
  if (!nextDue && monthly > 0) {
    let m = coveredUntil && coveredUntil >= current ? addMonths(coveredUntil, 1) : addMonths(current, 1)
    for (let i = 0; i < 24 && chargeFor(c, m) <= 0; i++) m = addMonths(m, 1)
    if (chargeFor(c, m) > 0) nextDue = monthDue(c, m)
  }
  return { monthly, start, months, paidTotal, owed, lateMonths, status, coveredUntil, credit: Math.max(0, left), lastPayment: payments.at(-1) ?? null, nextDue }
}

export type CollectionStats = { expected: number; collected: number; late: number; lateAmount: number; soon: number; payments: number }

/** This month: what the clients' services add up to, what was collected (payments dated this month), and who is late. */
export function collectionStats(clients: Client[], payments: Payment[], today: string): CollectionStats {
  const month = monthOf(today)
  const ids = new Set(clients.map((c) => c.id))
  const thisMonth = payments.filter((p) => monthOf(p.date) === month && ids.has(p.clientId))
  let late = 0
  let lateAmount = 0
  let soon = 0
  for (const c of clients) {
    const l = ledger(c, payments, today)
    if (l.status === "atrasado") {
      late++
      lateAmount += l.owed
    }
    if (l.status === "por-vencer") soon++
  }
  return { expected: clients.reduce((a, c) => a + chargeFor(c, month), 0), collected: thisMonth.reduce((a, p) => a + p.amount, 0), late, lateAmount, soon, payments: thisMonth.length }
}

/**
 * Lines for the MikroTik "Morosos" script (/interno/routers/scripts-mikrotik → Scripts de experto): "usuario,plan" for each internet
 * service with a PPPoE user of the late clients (the plan lets the script put the account back when it's paid).
 */
export function morososLines(clients: Client[], payments: Payment[], today: string): string {
  return clients
    .filter((c) => ledger(c, payments, today).status === "atrasado")
    .flatMap((c) => c.services.filter((s) => s.type === "internet" && s.status !== "cancelado" && s.pppoeUser).map((s) => (s.plan ? `${s.pppoeUser},${s.plan}` : s.pppoeUser)))
    .join("\n")
}

/** Payments as CSV (Spanish headers, BOM so Excel reads accents). */
export function paymentsCsv(payments: Payment[], nameOf: (clientId: string) => string, methodLabel: (m: PaymentMethod) => string): string {
  const cell = csvCell
  const rows = [["Fecha", "Cliente", "Monto", "Forma de pago", "Referencia", "Notas", "Registró"]]
  for (const p of [...payments].sort((a, b) => b.date.localeCompare(a.date))) rows.push([p.date, nameOf(p.clientId), p.amount.toFixed(2), methodLabel(p.method), p.reference, p.notes, p.by])
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")
}

// ── Reading stored values ────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : "")
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "")

export function decodePayment(v: unknown): Payment | null {
  if (!isObj(v)) return null
  const amount = typeof v.amount === "number" && Number.isFinite(v.amount) ? Math.min(Math.max(Math.round(v.amount * 100) / 100, 0), 1e7) : 0
  return {
    id: id(v.id) || newId(),
    clientId: id(v.clientId),
    date: day(v.date),
    amount,
    method: (PAYMENT_METHODS as readonly string[]).includes(v.method as string) ? (v.method as PaymentMethod) : "otro",
    reference: str(v.reference, 120),
    notes: str(v.notes, 500),
    by: str(v.by, 60),
    createdAt: typeof v.createdAt === "string" ? v.createdAt.slice(0, 40) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
