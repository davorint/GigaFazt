/**
 * What needs attention today across the internal sections (owner, 2026-11-18): the "Hoy" screen on /interno and the
 * daily summary sent to the team's chat use this same function, so both always say the same thing.
 *
 * - Reportes: new ones nobody has picked up, open urgent/high ones, open ones older than two days.
 * - Cobranza: clients late on a payment and how much they owe (lib/payments ledger).
 * - Herramientas: tools in use (quantity > 0) with an alert (service overdue, counter at its limit, damaged, lost…).
 * - Materiales: items below their minimum in the warehouse.
 * - Notas: open pinned notes.
 * - Cuentas: bills overdue or due within BILLS_SOON_DAYS, one-off charges overdue, and PPD payments still without their
 *   complemento de pago (both ways).
 */
import type { Client } from "../clients/model"
import { clientLabel } from "../clients/model"
import type { Item } from "../materials/catalog"
import type { Note } from "../notes/model"
import { collectionStats, ledger, type Payment } from "../payments/model"
import { isOpen, reportCode, type Report } from "../reports/model"
import { BODEGA, countAt, type Move, type Unit } from "../stock/model"
import { toolAlerts, toolLabel, type Alert, type Tool } from "../tools/model"
import type { Payable } from "../finance/payables"
import type { Receivable } from "../finance/receivables"
import { balanceOf, complementPending, isOpenDoc } from "../finance/common"

export type TodayInput = {
  reports: Report[]
  clients: Client[]
  payments: Payment[]
  tools: Tool[]
  items: Item[]
  moves: Move[]
  units: Unit[]
  notes: Note[]
  payables?: Payable[]
  receivables?: Receivable[]
}

export type Today = {
  reports: { fresh: { id: string; label: string }[]; urgent: number; stale: number; open: number }
  payments: { late: { id: string; label: string; owed: number }[]; lateAmount: number }
  tools: { id: string; label: string; alerts: Alert[] }[]
  lowStock: { id: string; name: string; has: number; min: number; unit: string }[]
  pinned: { id: string; title: string }[]
  /** Bills (cuentas por pagar) overdue or due within BILLS_SOON_DAYS, soonest first. */
  bills: { id: string; label: string; balance: number; due: string; late: boolean }[]
  /** One-off charges (cuentas por cobrar) past their due date. */
  charges: { id: string; label: string; balance: number; due: string }[]
  /** PPD documents with payments still without their complemento: "cobrar" ones we issue, "pagar" ones we ask for. */
  complements: { id: string; side: "pagar" | "cobrar"; label: string; deadline: string }[]
}

/** Days ahead a bill shows on "Hoy" before it's due. */
export const BILLS_SOON_DAYS = 3

/** Alerts that mean the tool can't be used as it is (the rest are reminders). */
export const SERIOUS: Alert[] = ["service-overdue", "counter-limit", "condition"]

const STALE_HOURS = 48

export function todaySummary(d: TodayInput, today: string, now = Date.now()): Today {
  const open = d.reports.filter(isOpen)
  const fresh = open
    .filter((r) => r.status === "nuevo")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => ({ id: r.id, label: [reportCode(r), r.name || d.clients.find((c) => c.id === r.clientId)?.name || ""].filter(Boolean).join(" · ") }))
  const urgent = open.filter((r) => r.priority === "urgente" || r.priority === "alta").length
  const stale = open.filter((r) => now - Date.parse(r.createdAt) > STALE_HOURS * 3600e3).length

  const late = d.clients
    .map((c) => ({ c, l: ledger(c, d.payments, today) }))
    .filter((x) => x.l.status === "atrasado")
    .sort((a, b) => b.l.owed - a.l.owed)
    .map((x) => ({ id: x.c.id, label: clientLabel(x.c), owed: x.l.owed }))

  const tools = d.tools
    .filter((x) => x.quantity > 0)
    .map((x) => ({ id: x.id, label: toolLabel(x), alerts: toolAlerts(x, today) }))
    .filter((x) => x.alerts.length > 0)
    .sort((a, b) => Number(b.alerts.some((z) => SERIOUS.includes(z))) - Number(a.alerts.some((z) => SERIOUS.includes(z))) || a.label.localeCompare(b.label, "es"))

  const lowStock = d.items
    .filter((x) => x.minStock !== null)
    .map((x) => ({ id: x.id, name: x.name, has: countAt(x, d.moves, d.units, BODEGA), min: x.minStock ?? 0, unit: x.unit }))
    .filter((x) => x.has < x.min)

  const pinned = d.notes.filter((n) => n.pinned && !n.doneAt).map((n) => ({ id: n.id, title: n.title || n.body.slice(0, 80) }))

  const soon = (() => {
    const x = new Date(`${today}T12:00:00Z`)
    x.setUTCDate(x.getUTCDate() + BILLS_SOON_DAYS)
    return x.toISOString().slice(0, 10)
  })()
  const pays = d.payables ?? []
  const recs = d.receivables ?? []
  const bills = pays
    .filter((x) => isOpenDoc(x) && x.amount > 0 && x.dueDate && x.dueDate <= soon)
    .map((x) => ({ id: x.id, label: [x.concept, x.payee].filter(Boolean).join(" · ") || "—", balance: balanceOf(x), due: x.dueDate, late: x.dueDate < today }))
    .sort((a, b) => a.due.localeCompare(b.due))
  const charges = recs
    .filter((x) => isOpenDoc(x) && x.amount > 0 && x.dueDate && x.dueDate < today)
    .map((x) => ({ id: x.id, label: [x.concept, x.payer].filter(Boolean).join(" · ") || "—", balance: balanceOf(x), due: x.dueDate }))
    .sort((a, b) => a.due.localeCompare(b.due))
  const complements = [
    ...recs.filter((x) => !x.cancelled).map((x) => ({ id: x.id, side: "cobrar" as const, label: x.concept || x.payer || "—", deadline: complementPending(x) ?? "" })),
    ...pays.filter((x) => !x.cancelled).map((x) => ({ id: x.id, side: "pagar" as const, label: x.concept || x.payee || "—", deadline: complementPending(x) ?? "" })),
  ]
    .filter((x) => x.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))

  return {
    reports: { fresh, urgent, stale, open: open.length },
    payments: { late, lateAmount: collectionStats(d.clients, d.payments, today).lateAmount },
    tools,
    lowStock,
    pinned,
    bills,
    charges,
    complements,
  }
}

/** Nothing to look at today. */
export const allClear = (t: Today) => !t.reports.open && !t.payments.late.length && !t.tools.length && !t.lowStock.length && !t.pinned.length && !t.bills.length && !t.charges.length && !t.complements.length
