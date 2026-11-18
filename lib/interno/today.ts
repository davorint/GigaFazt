/**
 * What needs attention today across the internal sections (owner, 2026-11-18): the "Hoy" screen on /interno and the
 * daily summary sent to the team's chat use this same function, so both always say the same thing.
 *
 * - Reportes: new ones nobody has picked up, open urgent/high ones, open ones older than two days.
 * - Cobranza: clients late on a payment and how much they owe (lib/payments ledger).
 * - Herramientas: tools in use (quantity > 0) with an alert (service overdue, counter at its limit, damaged, lost…).
 * - Materiales: items below their minimum in the warehouse.
 * - Notas: open pinned notes.
 */
import type { Client } from "../clients/model"
import { clientLabel } from "../clients/model"
import type { Item } from "../materials/catalog"
import type { Note } from "../notes/model"
import { collectionStats, ledger, type Payment } from "../payments/model"
import { isOpen, reportCode, type Report } from "../reports/model"
import { BODEGA, countAt, type Move, type Unit } from "../stock/model"
import { toolAlerts, toolLabel, type Alert, type Tool } from "../tools/model"

export type TodayInput = {
  reports: Report[]
  clients: Client[]
  payments: Payment[]
  tools: Tool[]
  items: Item[]
  moves: Move[]
  units: Unit[]
  notes: Note[]
}

export type Today = {
  reports: { fresh: { id: string; label: string }[]; urgent: number; stale: number; open: number }
  payments: { late: { id: string; label: string; owed: number }[]; lateAmount: number }
  tools: { id: string; label: string; alerts: Alert[] }[]
  lowStock: { id: string; name: string; has: number; min: number; unit: string }[]
  pinned: { id: string; title: string }[]
}

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

  return {
    reports: { fresh, urgent, stale, open: open.length },
    payments: { late, lateAmount: collectionStats(d.clients, d.payments, today).lateAmount },
    tools,
    lowStock,
    pinned,
  }
}

/** Nothing to look at today. */
export const allClear = (t: Today) => !t.reports.open && !t.payments.late.length && !t.tools.length && !t.lowStock.length && !t.pinned.length
