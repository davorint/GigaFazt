/**
 * Client self-service (WispDavor phase 9, owner 2026-11-22: "do them all"): faults reported from the portal, WhatsApp
 * updates when a report moves on, and payment reminders sent by themselves. Pure rules here; sending and storage in
 * selfservice-server.ts.
 *
 * Automatic notices are off until an admin turns them on (each message costs, and Meta must approve the templates first).
 * Cobranza's calendar: everyone is due on day 1 and has until day 10; late and cut on the 11th. So:
 * - "recordatorio" on the reminder day (default 3) to whoever still owes this month's bill;
 * - "corte" on the notice day (default 9) to whoever is still behind and still has active internet (not one already
 *   suspended), unless they have a payment promise still standing;
 * - never to clients on card auto-pay (the charge itself writes to them if it fails), never twice in a month.
 */
import type { ReportCategory, ReportStatus } from "../reports/model"
import type { TemplateId } from "./whatsapp"

export type AutoNotices = { reminders: boolean; reminderDay: number; noticeDay: number; reportUpdates: boolean }
export const DEFAULT_NOTICES: AutoNotices = { reminders: false, reminderDay: 3, noticeDay: 9, reportUpdates: false }
/** The last day to pay before the cut (Cobranza: late on the 11th). */
export const PAY_BY_DAY = 10

const day = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= PAY_BY_DAY ? v : d)

export function decodeNotices(v: unknown): AutoNotices {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const reminderDay = day(o.reminderDay, DEFAULT_NOTICES.reminderDay)
  const noticeDay = day(o.noticeDay, DEFAULT_NOTICES.noticeDay)
  return {
    reminders: o.reminders === true,
    reminderDay,
    // The cut-off notice comes after the reminder (or on the same day only if both are set so; then just the notice).
    noticeDay: Math.max(noticeDay, reminderDay),
    reportUpdates: o.reportUpdates === true,
  }
}

/** Which reminder goes today (YYYY-MM-DD), if any; the cut-off notice wins when both fall on one day. */
export function reminderToday(today: string, s: AutoNotices): Extract<TemplateId, "recordatorio" | "corte"> | null {
  if (!s.reminders) return null
  const d = Number(today.slice(8, 10))
  if (d === s.noticeDay) return "corte"
  if (d === s.reminderDay) return "recordatorio"
  return null
}

/** The once-a-month key of a reminder ("rec-2026-11" / "corte-2026-11"). */
export const reminderRef = (t: "recordatorio" | "corte", today: string) => `${t === "corte" ? "corte" : "rec"}-${today.slice(0, 7)}`

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
/** "10 de noviembre": the last day to pay this month. */
export const payBy = (today: string) => `${PAY_BY_DAY} de ${MONTHS[Number(today.slice(5, 7)) - 1]}`

/** The report statuses the client hears about (a technician is coming; it's fixed). */
export const NOTIFY_STATUSES = ["visita", "resuelto"] as const satisfies readonly ReportStatus[]
export const STATUS_WORDS: Record<(typeof NOTIFY_STATUSES)[number], string> = { visita: "con visita técnica programada", resuelto: "resuelto" }
export const reportRef = (id: string, status: string) => `rep-${id}-${status}`

/** What a client can report from the portal (the same categories as Reportes, but plan requests have their own button). */
export const PORTAL_CATEGORIES = ["sin-servicio", "lento", "intermitente", "wifi", "tv", "equipo", "otro"] as const satisfies readonly ReportCategory[]
export const MAX_DESCRIPTION = 1000
/** Without service at all is urgent; the rest normal (the team re-sorts in Reportes). */
export const portalPriority = (c: ReportCategory) => (c === "sin-servicio" ? "alta" : "normal")
/** One open portal fault per client per this many hours: a second one answers the first's code. */
export const DUP_HOURS = 24
