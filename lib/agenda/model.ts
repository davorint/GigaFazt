/**
 * The agenda (/interno/admin/agenda, owner 2026-11-19): installations and visits by day and technician. An
 * appointment can come from a website request ("Agendar instalación"), a client ("Agendar visita") or be typed; the
 * reports' visits (status "visita" with a date) are shown next to them without being copied.
 *
 * Synced like the other sections (kind "agenda", table `appointments`). `decodeAppointment` never throws.
 */
import { newId } from "../survey/id"

export const APPT_KINDS = ["instalacion", "visita", "otro"] as const
export type ApptKind = (typeof APPT_KINDS)[number]
export const APPT_STATUSES = ["pendiente", "confirmada", "hecha", "cancelada"] as const
export type ApptStatus = (typeof APPT_STATUSES)[number]

export type Appointment = {
  id: string
  kind: ApptKind
  /** yyyy-mm-dd. */
  date: string
  /** "HH:MM" or "" (any time that day). */
  time: string
  /** The technician ("" = not assigned yet). */
  who: string
  status: ApptStatus
  /** Who it's for: a client, a website request (before it's a client), the report it's about. */
  clientId: string
  leadId: string
  reportId: string
  siteId: string
  /** Contact copied when it was made (the request may not be a client yet, and the agenda works offline). */
  name: string
  phone: string
  address: string
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

export function newAppointment(p: Partial<Appointment> = {}): Appointment {
  return { id: newId(), kind: "instalacion", date: "", time: "", who: "", status: "pendiente", clientId: "", leadId: "", reportId: "", siteId: "", name: "", phone: "", address: "", notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

/** Still to do (not done, not cancelled). */
export const isOpenAppt = (a: Pick<Appointment, "status">) => a.status === "pendiente" || a.status === "confirmada"

/** Sorted by day, then time (no time last in its day). */
export const byWhen = (a: Pick<Appointment, "date" | "time">, b: Pick<Appointment, "date" | "time">) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99")

/** The 7 days of the week (Monday first) that contain `day` (yyyy-mm-dd). */
export function weekOf(day: string): string[] {
  const d = new Date(`${day}T12:00:00Z`)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setUTCDate(monday.getUTCDate() + i)
    return x.toISOString().slice(0, 10)
  })
}

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const ID = /^[\w-]{6,64}$/
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "")
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

export function decodeAppointment(v: unknown): Appointment | null {
  if (!isObj(v)) return null
  return {
    id: id(v.id) || newId(),
    kind: pick(APPT_KINDS, v.kind, "otro"),
    date: typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : "",
    time: typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? v.time : "",
    who: str(v.who, 60),
    status: pick(APPT_STATUSES, v.status, "pendiente"),
    clientId: id(v.clientId),
    leadId: typeof v.leadId === "string" && /^[\w-]{6,64}$/.test(v.leadId) ? v.leadId : "",
    reportId: id(v.reportId),
    siteId: id(v.siteId),
    name: str(v.name, 200),
    phone: str(v.phone, 40),
    address: str(v.address, 300),
    notes: str(v.notes, 2000),
    by: str(v.by, 60),
    createdAt: typeof v.createdAt === "string" ? v.createdAt.slice(0, 40) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
