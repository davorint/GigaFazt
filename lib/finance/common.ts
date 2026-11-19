/**
 * What accounts payable (cuentas por pagar) and accounts receivable (cuentas por cobrar) share (owner, 2026-11-19):
 * partial payments, the balance and status of a document, aging buckets, and the CFDI fields with the complemento de
 * pago rule. Each section keeps its own records (lib/finance/payables.ts, receivables.ts); only these rules are shared.
 *
 * CFDI (SAT): an invoice can be PUE (paid in one go when issued) or PPD (paid later or in parts). Every payment of a PPD
 * invoice needs its own complemento de pago (REP), issued by the 5th of the month after that payment, so it is tracked
 * per payment.
 */
import { newId } from "../survey/id"

export const FIN_METHODS = ["transferencia", "efectivo", "deposito", "tarjeta", "otro"] as const
export type FinMethod = (typeof FIN_METHODS)[number]
export const CFDI_METHODS = ["", "PUE", "PPD"] as const
export type CfdiMethod = (typeof CFDI_METHODS)[number]

export type FinPayment = {
  id: string
  date: string
  amount: number
  method: FinMethod
  reference: string
  /** PPD: this payment's complemento de pago was issued (receivables) or received (payables), and its folio. */
  repDone: boolean
  rep: string
}

/** The invoice behind a document ("" when there is none yet). */
export type Cfdi = {
  /** Folio fiscal (UUID), "" = not recorded. */
  uuid: string
  method: CfdiMethod
}

export const newFinPayment = (p: Partial<FinPayment> = {}): FinPayment => ({ id: newId(), date: "", amount: 0, method: "transferencia", reference: "", repDone: false, rep: "", ...p })
export const emptyCfdi = (): Cfdi => ({ uuid: "", method: "" })

const round2 = (x: number) => Math.round(x * 100) / 100
export const paidOf = (d: { payments: FinPayment[] }) => round2(d.payments.reduce((a, p) => a + p.amount, 0))
export const balanceOf = (d: { amount: number; payments: FinPayment[] }) => Math.max(0, round2(d.amount - paidOf(d)))

export type FinStatus = "pagado" | "parcial" | "vencido" | "pendiente" | "cancelado"

/** Still to settle: not cancelled, and with a balance or still without an amount (just added, being filled in). */
export const isOpenDoc = (d: { amount: number; payments: FinPayment[]; cancelled: boolean }) => !d.cancelled && (d.amount <= 0 || balanceOf(d) > 0.005)

/** Paid more than the amount (a typo, or a credit to apply later). */
export const overpaid = (d: { amount: number; payments: FinPayment[] }) => d.amount > 0 && paidOf(d) > d.amount + 0.005

/** Where a document stands today: cancelled, paid, overdue (past its due date with a balance), partly paid or pending. */
export function finStatus(d: { amount: number; payments: FinPayment[]; dueDate: string; cancelled: boolean }, today: string): FinStatus {
  if (d.cancelled) return "cancelado"
  // Without an amount yet it isn't paid: it's pending until the amount is typed.
  if (d.amount <= 0) return "pendiente"
  const bal = balanceOf(d)
  if (bal <= 0.005) return "pagado"
  if (d.dueDate && d.dueDate < today) return "vencido"
  return paidOf(d) > 0 ? "parcial" : "pendiente"
}

export const AGING = ["porVencer", "d0_30", "d31_60", "d61_90", "d90"] as const
export type AgingBucket = (typeof AGING)[number]

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

/** The aging bucket of an amount due on `due`, as of `today` (not due yet, or days past due). */
export function agingOf(due: string, today: string): AgingBucket {
  if (!due || due >= today) return "porVencer"
  const n = days(due, today)
  return n <= 30 ? "d0_30" : n <= 60 ? "d31_60" : n <= 90 ? "d61_90" : "d90"
}

/** Totals per aging bucket. */
export function agingTotals(items: { due: string; amount: number }[], today: string): Record<AgingBucket, number> {
  const out = Object.fromEntries(AGING.map((b) => [b, 0])) as Record<AgingBucket, number>
  for (const it of items) out[agingOf(it.due, today)] += it.amount
  for (const b of AGING) out[b] = round2(out[b])
  return out
}

/** Day 5 of the month after a date: the deadline for a payment's complemento de pago. */
export function complementDeadline(paymentDate: string): string {
  const [y, m] = paymentDate.split("-").map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}-05`
}

/** The payments of a PPD invoice still without their complemento de pago. */
export const paymentsWithoutRep = (d: { cfdi: Cfdi; payments: FinPayment[] }) => (d.cfdi.method === "PPD" ? d.payments.filter((p) => !p.repDone && p.date) : [])

/**
 * A PPD invoice with payments still without their complemento: the earliest deadline (day 5 of the month after the
 * oldest such payment), else null. Late when the deadline has passed.
 */
export function complementPending(d: { cfdi: Cfdi; payments: FinPayment[] }): string | null {
  const first = paymentsWithoutRep(d).map((p) => p.date).sort()[0]
  return first ? complementDeadline(first) : null
}

// ── Reading stored values ───────────────────────────────────────────────────

type Obj = Record<string, unknown>
export const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
export const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
export const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(round2(v), 0), 1e9) : 0)
export const idOf = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : "")
export const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/

/** A folio fiscal as stored: uppercase UUID, or "" when it isn't one. */
export const folio = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : ""
  return UUID.test(s) ? s : ""
}

/** Payments as stored; `allRep` marks every one with its complemento (documents saved when it was a single box). */
export function decodePayments(v: unknown, allRep = false): FinPayment[] {
  return Array.isArray(v)
    ? v
        .filter(isObj)
        .slice(0, 200)
        .map((p) => ({ id: idOf(p.id) || newId(), date: day(p.date), amount: money(p.amount), method: pick(FIN_METHODS, p.method, "otro"), reference: str(p.reference, 120), repDone: allRep || p.repDone === true, rep: folio(p.rep) }))
        .filter((p) => p.amount > 0)
    : []
}

export function decodeCfdi(v: unknown): Cfdi {
  if (!isObj(v)) return emptyCfdi()
  return { uuid: folio(v.uuid), method: pick(CFDI_METHODS, v.method, "") }
}

/** A document saved when the complemento was one box for the whole invoice (2026-11-19): it counts for every payment. */
export const legacyRep = (v: unknown) => isObj(v) && v.complement === true
