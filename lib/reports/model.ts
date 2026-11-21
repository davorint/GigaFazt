/**
 * Client service problem reports (/interno/admin/reportes_clientes, owner 2026-11-18; staff open them from a call or
 * WhatsApp, and clients from the public form at /reportar).
 *
 * A report: the client (from Clientes, or the name, phone and address someone gave when it isn't matched), what's
 * wrong (category, description), priority, status (nuevo → en proceso → visita programada → resuelto / descartado),
 * who has it, the visit date, and when solved, the cause and what was done; a log of notes with who wrote them.
 * Synced like the other sections (kind "reports"); reports from the public form are written straight to the database
 * and reach the phones on their next sync.
 */
import { newId } from "../survey/id"
import { decodeField, emptyField, type FieldWork } from "../field/model"

export const REPORT_CATEGORIES = ["sin-servicio", "lento", "intermitente", "wifi", "tv", "equipo", "otro"] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]
export const REPORT_STATUSES = ["nuevo", "en-proceso", "visita", "resuelto", "descartado"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]
export const PRIORITIES = ["urgente", "alta", "normal", "baja"] as const
export type Priority = (typeof PRIORITIES)[number]
export const CAUSES = ["", "fibra", "conector", "ont", "equipo-cliente", "wifi-cliente", "red", "carrier", "pago", "configuracion", "sin-falla", "otro"] as const
export type Cause = (typeof CAUSES)[number]
export const SOURCES = ["interno", "web"] as const
export type Source = (typeof SOURCES)[number]

export type ReportNote = { id: string; at: string; by: string; text: string }

export type Report = {
  id: string
  source: Source
  createdAt: string
  /** From Clientes ("" = not matched yet: name/phone/address say who). */
  clientId: string
  name: string
  phone: string
  address: string
  /** The location (from the client, or chosen). */
  siteId: string
  category: ReportCategory
  description: string
  priority: Priority
  status: ReportStatus
  assignee: string
  visitDate: string
  cause: Cause
  resolution: string
  resolvedAt: string
  notes: ReportNote[]
  /** Public form: when the person accepted the privacy notice (LFPDPPP: consent must be provable). "" for staff reports. */
  consentAt: string
  /** What the technician recorded on the visit (phase 5, lib/field/model.ts). */
  field: FieldWork
  by: string
  updatedAt: string
}

/** No service at all is urgent-ish by default; the rest normal. */
export const defaultPriority = (c: ReportCategory): Priority => (c === "sin-servicio" ? "alta" : "normal")

export function newReport(p: Partial<Report> = {}): Report {
  const category = p.category ?? "sin-servicio"
  return {
    id: newId(),
    source: "interno",
    createdAt: new Date().toISOString(),
    clientId: "",
    name: "",
    phone: "",
    address: "",
    siteId: "",
    category,
    description: "",
    priority: defaultPriority(category),
    status: "nuevo",
    assignee: "",
    visitDate: "",
    cause: "",
    resolution: "",
    resolvedAt: "",
    notes: [],
    consentAt: "",
    field: emptyField(),
    by: "",
    updatedAt: "",
    ...p,
  }
}

export const newNote = (by: string, text: string, at = new Date().toISOString()): ReportNote => ({ id: newId(), at, by, text })

/** A short code to read over the phone: R-1A2B3C (from the id). */
export const reportCode = (r: { id: string }) => `R-${r.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`

export const isOpen = (r: Report) => r.status !== "resuelto" && r.status !== "descartado"

/**
 * A status change with its side effects: resolving stamps the time (reopening clears it), and a note records who
 * changed it.
 */
export function setStatus(r: Report, status: ReportStatus, by: string, label: (s: ReportStatus) => string, now = new Date().toISOString()): Report {
  if (status === r.status) return r
  const done = status === "resuelto" || status === "descartado"
  return { ...r, status, resolvedAt: done ? r.resolvedAt || now : "", notes: [...r.notes, newNote(by, `${label(r.status)} → ${label(status)}`, now)] }
}

/** Hours from opening to solving (null while open). */
export function hoursToSolve(r: Report): number | null {
  if (!r.resolvedAt) return null
  const h = (Date.parse(r.resolvedAt) - Date.parse(r.createdAt)) / 36e5
  return Number.isFinite(h) && h >= 0 ? h : null
}

export type ReportStats = { open: number; urgent: number; fresh: number; web: number; solved30: number; avgHours: number | null }

export function reportStats(list: Report[], now = Date.now()): ReportStats {
  const open = list.filter(isOpen)
  const solved = list.filter((r) => r.status === "resuelto" && r.resolvedAt && now - Date.parse(r.resolvedAt) <= 30 * 864e5)
  const hours = solved.map(hoursToSolve).filter((h): h is number => h !== null)
  return {
    open: open.length,
    urgent: open.filter((r) => r.priority === "urgente").length,
    fresh: list.filter((r) => r.status === "nuevo").length,
    web: list.filter((r) => r.status === "nuevo" && r.source === "web").length,
    solved30: solved.length,
    avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
  }
}

/**
 * Other open reports that may be the same outage: same location, opened within `hours` of this one (a fiber cut or
 * a dead port shows up as several clients at once). Same OLT port first when known.
 */
export function relatedOpen(r: Report, list: Report[], portOf: (clientId: string) => string, hours = 24): Report[] {
  if (!r.siteId) return []
  const t = Date.parse(r.createdAt)
  const port = r.clientId ? portOf(r.clientId) : ""
  return list
    .filter((x) => x.id !== r.id && isOpen(x) && x.siteId === r.siteId && Math.abs(Date.parse(x.createdAt) - t) <= hours * 36e5)
    .sort((a, b) => Number(!!port && portOf(b.clientId) === port) - Number(!!port && portOf(a.clientId) === port) || b.createdAt.localeCompare(a.createdAt))
}

/** Clients with `min` or more reports in the last `days` days (a problem that keeps coming back). */
export function repeatClients(list: Report[], min = 3, days = 90, now = Date.now()): { clientId: string; n: number }[] {
  const count = new Map<string, number>()
  for (const r of list) if (r.clientId && now - Date.parse(r.createdAt) <= days * 864e5) count.set(r.clientId, (count.get(r.clientId) ?? 0) + 1)
  return [...count].filter(([, n]) => n >= min).map(([clientId, n]) => ({ clientId, n })).sort((a, b) => b.n - a.n)
}

/** Digits of a Mexican phone without the country code (last 10). */
export const phoneKey = (s: string) => s.replace(/\D/g, "").slice(-10)

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const ID = /^[\w-]{6,64}$/
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "")
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : "")
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

export function decodeReport(v: unknown): Report | null {
  if (!isObj(v)) return null
  const category = pick(REPORT_CATEGORIES, v.category, "otro")
  return {
    id: id(v.id) || newId(),
    source: pick(SOURCES, v.source, "interno"),
    createdAt: iso(v.createdAt) || new Date(0).toISOString(),
    clientId: id(v.clientId),
    name: str(v.name, 120),
    phone: str(v.phone, 40),
    address: str(v.address, 300),
    siteId: id(v.siteId),
    category,
    description: str(v.description, 2000),
    priority: pick(PRIORITIES, v.priority, defaultPriority(category)),
    status: pick(REPORT_STATUSES, v.status, "nuevo"),
    assignee: str(v.assignee, 60),
    visitDate: date(v.visitDate),
    cause: pick(CAUSES, v.cause, ""),
    resolution: str(v.resolution, 2000),
    resolvedAt: iso(v.resolvedAt),
    notes: Array.isArray(v.notes)
      ? v.notes
          .filter(isObj)
          .slice(0, 300)
          .map((n) => ({ id: id(n.id) || newId(), at: iso(n.at), by: str(n.by, 60), text: str(n.text, 2000) }))
      : [],
    consentAt: iso(v.consentAt),
    field: decodeField(v.field),
    by: str(v.by, 60),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
