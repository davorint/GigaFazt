/**
 * The collections funnel (WispDavor phase 6, owner 2026-11-21: "Collections funnel"): for each month, the clients who
 * went late on it (Cobranza: due on the 1st, late on the 11th), whether they got a notice (a reminder or cut-off
 * WhatsApp, or Cobranza's "recordado"), whether they were suspended, and when they paid it: on their own, after a
 * notice, or after being suspended. Pure: the server gives the notice and suspension days (lib/wispdavor/funnel-server).
 */
import type { Client } from "../clients/model"
import { addMonths, dueDate, GRACE_DAYS, ledger, type Payment } from "../payments/model"

export type FunnelEvent = { clientId: string; kind: "aviso" | "suspension"; day: string }
export type Outcome = "solo" | "aviso" | "suspension" | "debe" | "baja"
export type FunnelRow = { clientId: string; notified: boolean; suspended: boolean; paidDay: string; days: number | null; outcome: Outcome }
export type FunnelMonth = { month: string; lateDay: string; rows: FunnelRow[]; late: number; notified: number; suspended: number; paid: Record<"solo" | "aviso" | "suspension", number>; owing: number; gone: number; medianDays: number | null }

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const paidOn = (c: Client, pays: Payment[], month: string, day: string) => {
  const line = ledger(c, pays, day).months.find((m) => m.month === month)
  return !line || line.charge - line.paid <= 0.005
}

/** One month's funnel: the clients late on it as of its 11th, and what happened next up to today. */
export function funnelMonth(clients: Client[], payments: Payment[], events: FunnelEvent[], month: string, today: string): FunnelMonth {
  const lateDay = plusDays(dueDate(month), GRACE_DAYS)
  const rows: FunnelRow[] = []
  for (const c of clients) {
    const mine = payments.filter((p) => p.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    // Late on it: still unpaid with the payments made before its late day.
    if (!ledger(c, mine.filter((p) => p.date < lateDay), lateDay).lateMonths.includes(month)) continue
    // Paid: the first payment day from then on after which the month is covered.
    let paidDay = ""
    for (const d of [...new Set(mine.filter((p) => p.date >= lateDay && p.date <= today).map((p) => p.date))]) {
      if (paidOn(c, mine.filter((p) => p.date <= d), month, d)) {
        paidDay = d
        break
      }
    }
    const end = paidDay || today
    const ev = events.filter((e) => e.clientId === c.id && e.day <= end)
    const notified = ev.some((e) => e.kind === "aviso" && e.day >= dueDate(month))
    const suspended = ev.some((e) => e.kind === "suspension" && e.day >= lateDay)
    const gone = !paidDay && c.services.every((s) => s.status === "cancelado")
    const outcome: Outcome = paidDay ? (suspended ? "suspension" : notified ? "aviso" : "solo") : gone ? "baja" : "debe"
    rows.push({ clientId: c.id, notified, suspended, paidDay, days: paidDay ? between(lateDay, paidDay) : null, outcome })
  }
  const n = (o: Outcome) => rows.filter((r) => r.outcome === o).length
  return {
    month,
    lateDay,
    rows,
    late: rows.length,
    notified: rows.filter((r) => r.notified).length,
    suspended: rows.filter((r) => r.suspended).length,
    paid: { solo: n("solo"), aviso: n("aviso"), suspension: n("suspension") },
    owing: n("debe"),
    gone: n("baja"),
    medianDays: median(rows.filter((r) => r.days !== null).map((r) => r.days as number)),
  }
}

/** The last `count` months whose late day has come, newest first. */
export function funnelMonths(today: string, count = 6): string[] {
  let m = today.slice(0, 7)
  if (plusDays(dueDate(m), GRACE_DAYS) > today) m = addMonths(m, -1)
  return Array.from({ length: count }, (_, i) => addMonths(m, -i))
}
