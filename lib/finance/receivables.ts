/**
 * Cuentas por cobrar (/interno/admin/cuentas-por-cobrar, owner 2026-11-19: "everything owed, in one place"):
 * - one-off charges typed here: business projects, equipment sold, special installations… each with who owes it (a
 *   client from Clientes, or a typed name), the amount with IVA, issue and due dates, the payments received (partial or
 *   whole) and the invoice (CFDI);
 * - the monthly service balances, read from Cobranza (lib/payments ledger: same rules, same numbers), never copied.
 *
 * Synced like the other sections (kind "porcobrar", table `receivables`). `decodeReceivable` never throws.
 */
import { newId } from "../survey/id"
import { clientLabel, type Client } from "../clients/model"
import { GRACE_DAYS, ledger, type Payment } from "../payments/model"
import { decodeCfdi, decodePayments, day, emptyCfdi, idOf, isObj, legacyRep, money, pick, str, type Cfdi, type FinPayment } from "./common"

export const CHARGE_CATEGORIES = ["proyecto", "equipo", "instalacion", "servicio", "otro"] as const
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number]

export type Receivable = {
  id: string
  /** From Clientes ("" = not a client: `payer` says who). */
  clientId: string
  payer: string
  category: ChargeCategory
  concept: string
  /** MXN with IVA. */
  amount: number
  issueDate: string
  dueDate: string
  payments: FinPayment[]
  cfdi: Cfdi
  cancelled: boolean
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

export function newReceivable(p: Partial<Receivable> = {}): Receivable {
  return { id: newId(), clientId: "", payer: "", category: "proyecto", concept: "", amount: 0, issueDate: "", dueDate: "", payments: [], cfdi: emptyCfdi(), cancelled: false, notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

/**
 * One unpaid month of monthly service (from Cobranza). `lastDay` is the last day to pay before it's late (due + the
 * grace days − 1: the 10th for a month due the 1st), so its aging matches Cobranza's "atrasado".
 */
export type ServiceDue = { clientId: string; name: string; month: string; due: string; lastDay: string; amount: number }

const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Every month of service still owed, per client, as Cobranza computes it (oldest first). */
export function serviceReceivables(clients: Client[], payments: Payment[], today: string): ServiceDue[] {
  const out: ServiceDue[] = []
  for (const c of clients) {
    const l = ledger(c, payments, today)
    for (const m of l.months) {
      const left = Math.round((m.charge - m.paid) * 100) / 100
      if (left > 0.005) out.push({ clientId: c.id, name: clientLabel(c), month: m.month, due: m.due, lastDay: plusDays(m.due, GRACE_DAYS - 1), amount: left })
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}

// ── Reading stored or synced values ─────────────────────────────────────────

export function decodeReceivable(v: unknown): Receivable | null {
  if (!isObj(v)) return null
  return {
    id: idOf(v.id) || newId(),
    clientId: idOf(v.clientId),
    payer: str(v.payer, 200),
    category: pick(CHARGE_CATEGORIES, v.category, "otro"),
    concept: str(v.concept, 300),
    amount: money(v.amount),
    issueDate: day(v.issueDate),
    dueDate: day(v.dueDate),
    payments: decodePayments(v.payments, legacyRep(v.cfdi)),
    cfdi: decodeCfdi(v.cfdi),
    cancelled: v.cancelled === true,
    notes: str(v.notes, 2000),
    by: str(v.by, 60),
    createdAt: typeof v.createdAt === "string" ? v.createdAt.slice(0, 40) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
