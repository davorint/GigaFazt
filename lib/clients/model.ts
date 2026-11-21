/**
 * Clients (/interno/admin/clientes, owner 2026-11-17).
 *
 * Who they are (`kind`): residents of the buildings, the administrators of buildings or towers, companies, and TV
 * clients who buy IPTV (on our fiber or over another provider's internet). What they have (`services`): any number of
 * internet, IPTV and other services, each with its own status, price and start date (owner: "Yes, several"). Companies
 * and administrators carry a list of contacts with their role. Payment day and method are per client (no billing
 * system: the owner controls it by hand). Personal data: only behind the /interno password, synced through the
 * database like the surveys.
 *
 * `decodeClient` reads stored, imported or synced values field by field and never throws. `mergeClients` is the import
 * rule: a client already in the list (same PPPoE user, or same name + building + apartment) only gets its empty fields
 * filled and the services it lacks added; nothing typed by hand is overwritten.
 */
import { newId } from "../survey/id"

export const CLIENT_KINDS = ["residencial", "administracion", "empresa", "tv"] as const
export type ClientKind = (typeof CLIENT_KINDS)[number]
export const SERVICE_TYPES = ["internet", "iptv", "otro"] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]
export const SERVICE_STATUSES = ["activo", "suspendido", "cancelado"] as const
export type ServiceStatus = (typeof SERVICE_STATUSES)[number]
/** A client's status: from its services ("sin servicio" when it has none). */
export type ClientStatus = ServiceStatus | "sin-servicio"
/** Why a service was cancelled (owner, 2026-11-19), to learn where clients are lost ("" = not recorded). */
export const CANCEL_REASONS = ["", "precio", "fallas", "mudanza", "competencia", "falta-de-pago", "cierre", "otro"] as const
export type CancelReason = (typeof CANCEL_REASONS)[number]
export const PAY_METHODS = ["", "efectivo", "transferencia", "tarjeta", "deposito", "otro"] as const
export type PayMethod = (typeof PAY_METHODS)[number]

export type Contact = { id: string; name: string; role: string; phone: string; email: string }

export type Service = {
  id: string
  type: ServiceType
  status: ServiceStatus
  /** Internet: the plan (MikroTik profile or speed). IPTV: the package. Other: what it is. */
  plan: string
  /** MXN with IVA, per month; null = not set. */
  monthly: number | null
  /** Earlier prices: each applied up to and including `until` (YYYY-MM), oldest first; `monthly` applies after the last. */
  priceHistory: PricePeriod[]
  /** YYYY-MM-DD or "". */
  start: string
  /** When it was cancelled (YYYY-MM-DD, "" = not cancelled or not known): months due before it are still owed. */
  cancelledAt: string
  cancelReason: CancelReason
  cancelNote: string
  /**
   * Suspended on purpose, not for debt (owner, 2026-11-21: "Hold flag"): WispDavor's routers keep it suspended even when
   * the client is up to date, until this is unchecked. Debt suspensions don't set it and reconnect on payment.
   */
  hold: boolean
  /**
   * When it was on manual hold (owner, 2026-11-21: "manual holds shouldn't be charged"): from the day it was put on hold
   * to the day it came off ("" = still on hold). A month isn't charged when its invoice day (the 1st) falls in one.
   */
  holds: HoldPeriod[]
  notes: string
  // Internet only (empty on the others)
  ontModel: string
  ontSn: string
  pppoeUser: string
  deployment: string
  /** OLT frame/slot/port, e.g. 0/1/3. */
  oltPort: string
  ontId: number | null
  /** Light at the ONT and at the OLT from that ONT (dBm), and when it was read (lib/clients/optics.ts). */
  rxDbm: number | null
  oltRxDbm: number | null
  rxDate: string
  /** Earlier light readings, one per day, oldest first (the current one is rxDbm/rxDate). */
  rxHistory: LightReading[]
}

export type LightReading = { date: string; rx: number; oltRx: number | null }

export type PricePeriod = { until: string; monthly: number | null }

export type Client = {
  id: string
  kind: ClientKind
  /** Person, company or administration. */
  name: string
  phone: string
  whatsapp: string
  email: string
  /** Building or condominium (a company's address). */
  building: string
  tower: string
  apartment: string
  /** The deployment location (/interno/admin/despliegues) and its tower; "" = not set. */
  siteId: string
  towerId: string
  contacts: Contact[]
  services: Service[]
  payDay: number | null
  payMethod: PayMethod
  /** YYYY-MM: the first month charged in Cobranza ("" = from the first payment recorded or this month; lib/payments). */
  billingFrom: string
  /** The client promised to pay by this day (YYYY-MM-DD, "" = none) and what they said. */
  promiseDate: string
  promiseNote: string
  /** When a payment reminder was last sent (YYYY-MM-DD, "" = never). */
  remindedAt: string
  notes: string
  /** The website request it came from, if any. */
  leadId: string
  /** Data for the client's CFDI (WispDavor → Facturas, owner 2026-11-21: "Only who asks"); empty = no invoice asked. */
  fiscal: Fiscal
  createdAt: string
  updatedAt: string
}

/** What a CFDI needs of its receiver (SAT CFDI 4.0): RFC, name as in the tax certificate, regime, postal code, use. */
export type Fiscal = { rfc: string; name: string; regime: string; zip: string; use: string; email: string }
export const emptyFiscal = (): Fiscal => ({ rfc: "", name: "", regime: "", zip: "", use: "", email: "" })

export const DEFAULT_ONT = "EG8145B7-50"

export function newService(type: ServiceType, p: Partial<Service> = {}): Service {
  return {
    id: newId(),
    type,
    status: "activo",
    plan: "",
    monthly: null,
    priceHistory: [],
    start: "",
    cancelledAt: "",
    cancelReason: "",
    cancelNote: "",
    hold: false,
    holds: [],
    notes: "",
    ontModel: type === "internet" ? DEFAULT_ONT : "",
    ontSn: "",
    pppoeUser: "",
    deployment: "",
    oltPort: "",
    ontId: null,
    rxDbm: null,
    oltRxDbm: null,
    rxDate: "",
    rxHistory: [],
    ...p,
  }
}

export const newContact = (p: Partial<Contact> = {}): Contact => ({ id: newId(), name: "", role: "", phone: "", email: "", ...p })

export function newClient(p: Partial<Client> = {}): Client {
  const now = new Date().toISOString()
  return {
    id: newId(),
    kind: "residencial",
    name: "",
    phone: "",
    whatsapp: "",
    email: "",
    building: "",
    tower: "",
    apartment: "",
    siteId: "",
    towerId: "",
    contacts: [],
    services: [],
    payDay: null,
    payMethod: "",
    billingFrom: "",
    promiseDate: "",
    promiseNote: "",
    remindedAt: "",
    notes: "",
    leadId: "",
    fiscal: emptyFiscal(),
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null)
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 30) : new Date().toISOString())
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)
const idOf = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : newId())

export type HoldPeriod = { from: string; to: string }

/** Whether the service was on manual hold on a day (an open period counts only while the hold is still on). */
export const onHold = (s: Pick<Service, "hold" | "holds">, day: string) => s.holds.some((h) => h.from <= day && (h.to ? day < h.to : s.hold))

/**
 * The service with its manual hold on or off from today: on opens a period, off closes the open one (a period that
 * starts and ends the same day is dropped, it paused nothing).
 */
export function withHold<S extends Pick<Service, "hold" | "holds">>(s: S, on: boolean, today: string): S {
  const open = s.holds.find((h) => !h.to)
  if (on) return { ...s, hold: true, holds: open ? s.holds : [...s.holds, { from: today, to: "" }] }
  const holds = s.holds.map((h) => (h.to ? h : { ...h, to: today })).filter((h) => h.from < h.to)
  return { ...s, hold: false, holds }
}

function decodeService(v: unknown): Service | null {
  if (!isObj(v)) return null
  const type = oneOf(SERVICE_TYPES, v.type, "otro")
  const net = type === "internet"
  return {
    id: idOf(v.id),
    type,
    status: oneOf(SERVICE_STATUSES, v.status, "activo"),
    plan: str(v.plan, 120),
    monthly: num(v.monthly, 0, 1e7),
    priceHistory: Array.isArray(v.priceHistory)
      ? v.priceHistory
          .filter(isObj)
          .map((p) => ({ until: typeof p.until === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.until) ? p.until : "", monthly: num(p.monthly, 0, 1e7) }))
          .filter((p) => p.until)
          .sort((a, b) => a.until.localeCompare(b.until))
          .slice(-50)
      : [],
    start: date(v.start),
    cancelledAt: oneOf(SERVICE_STATUSES, v.status, "activo") === "cancelado" ? date(v.cancelledAt) : "",
    cancelReason: oneOf(SERVICE_STATUSES, v.status, "activo") === "cancelado" ? oneOf(CANCEL_REASONS, v.cancelReason, "") : "",
    cancelNote: oneOf(SERVICE_STATUSES, v.status, "activo") === "cancelado" ? str(v.cancelNote, 300) : "",
    hold: oneOf(SERVICE_STATUSES, v.status, "activo") === "suspendido" && v.hold === true,
    holds: Array.isArray(v.holds)
      ? v.holds
          .filter(isObj)
          .map((h) => ({ from: date(h.from), to: date(h.to) }))
          .filter((h) => h.from && (!h.to || h.from < h.to))
          .sort((a, b) => a.from.localeCompare(b.from))
          .slice(-50)
      : [],
    notes: str(v.notes, 2000),
    ontModel: net ? str(v.ontModel, 60) : "",
    ontSn: net ? str(v.ontSn, 40).toUpperCase() : "",
    pppoeUser: net ? str(v.pppoeUser, 64) : "",
    deployment: net ? str(v.deployment, 120) : "",
    oltPort: net ? str(v.oltPort, 20) : "",
    ontId: net ? num(v.ontId, 0, 255) : null,
    rxDbm: net ? num(v.rxDbm, -60, 15) : null,
    oltRxDbm: net ? num(v.oltRxDbm, -60, 15) : null,
    rxDate: net ? date(v.rxDate) : "",
    rxHistory: net && Array.isArray(v.rxHistory)
      ? v.rxHistory
          .filter(isObj)
          .map((x) => ({ date: date(x.date), rx: num(x.rx, -60, 15), oltRx: num(x.oltRx, -60, 15) }))
          .filter((x): x is LightReading => !!x.date && x.rx !== null)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-MAX_LIGHT_HISTORY)
      : [],
  }
}

function decodeContact(v: unknown): Contact | null {
  if (!isObj(v)) return null
  return { id: idOf(v.id), name: str(v.name, 200), role: str(v.role, 80), phone: str(v.phone, 40), email: str(v.email, 200) }
}

export function decodeClient(v: unknown): Client | null {
  if (!isObj(v)) return null
  const list = <T,>(x: unknown, f: (y: unknown) => T | null, max: number) => (Array.isArray(x) ? x.slice(0, max).map(f).filter((y): y is T => y !== null) : [])
  return {
    id: idOf(v.id),
    kind: oneOf(CLIENT_KINDS, v.kind, "residencial"),
    name: str(v.name, 200),
    phone: str(v.phone, 40),
    whatsapp: str(v.whatsapp, 40),
    email: str(v.email, 200),
    building: str(v.building, 200),
    tower: str(v.tower, 60),
    apartment: str(v.apartment, 60),
    siteId: typeof v.siteId === "string" && /^[\w-]{6,64}$/.test(v.siteId) ? v.siteId : "",
    towerId: typeof v.towerId === "string" && /^[\w-]{6,64}$/.test(v.towerId) ? v.towerId : "",
    contacts: list(v.contacts, decodeContact, 30),
    services: list(v.services, decodeService, 50),
    payDay: num(v.payDay, 1, 31),
    payMethod: oneOf(PAY_METHODS, v.payMethod, ""),
    billingFrom: typeof v.billingFrom === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.billingFrom) ? v.billingFrom : "",
    promiseDate: date(v.promiseDate),
    promiseNote: str(v.promiseNote, 300),
    remindedAt: date(v.remindedAt),
    notes: str(v.notes, 4000),
    leadId: str(v.leadId, 64),
    fiscal: decodeFiscal(v.fiscal),
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
  }
}

/** Light readings kept per service. */
export const MAX_LIGHT_HISTORY = 24

/**
 * A new light reading on a service (typed, or from the OLT's optical list): the reading it replaces goes to the history,
 * so a fiber that slowly loses light shows. Several readings the same day keep only the last one.
 */
export function withReading(s: Service, rx: number | null, oltRx: number | null, date: string): Service {
  let hist = s.rxHistory
  if (s.rxDbm !== null && s.rxDate && s.rxDate !== date) hist = [...hist.filter((h) => h.date !== s.rxDate), { date: s.rxDate, rx: s.rxDbm, oltRx: s.oltRxDbm }].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_LIGHT_HISTORY)
  return { ...s, rxDbm: rx, oltRxDbm: oltRx, rxDate: rx === null ? "" : date, rxHistory: hist }
}

/** How much light was lost since the first reading kept (dB, positive = less light now); null without history. */
export function lightDrop(s: Pick<Service, "rxDbm" | "rxHistory">): number | null {
  if (s.rxDbm === null || !s.rxHistory.length) return null
  return Math.round((s.rxHistory[0].rx - s.rxDbm) * 10) / 10
}

/** Active if any service is active; else suspended if any is; else cancelled; "sin-servicio" without services. */
export function clientStatus(c: Client): ClientStatus {
  if (!c.services.length) return "sin-servicio"
  for (const s of ["activo", "suspendido"] as const) if (c.services.some((x) => x.status === s)) return s
  return "cancelado"
}

/** What the active services add up to per month (services without a price count as 0). */
export const monthlyTotal = (c: Client) => c.services.filter((s) => s.status === "activo").reduce((a, s) => a + (s.monthly ?? 0), 0)

/** The client's PPPoE users (one per internet service that has one). */
export const pppoeUsers = (c: Client) => c.services.filter((s) => s.type === "internet" && s.pppoeUser).map((s) => s.pppoeUser)

/** An IPTV service watched over our fiber: the client has an internet service that isn't cancelled. */
export const onOurFiber = (c: Client) => c.services.some((s) => s.type === "internet" && s.status !== "cancelado")

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

/** Last 10 digits of a phone (Mexico, without the country code). */
const phone10 = (s: string) => s.replace(/\D/g, "").slice(-10)

/**
 * Other clients that look like this one while it's being typed (owner, 2026-11-19): the same phone or WhatsApp (last 10
 * digits) or the same PPPoE user. Says why, so the person can open the other one or keep both on purpose.
 */
export function possibleDuplicates(c: Client, list: Client[]): { client: Client; why: "phone" | "pppoe" }[] {
  const phones = new Set([c.phone, c.whatsapp].map(phone10).filter((x) => x.length === 10))
  const users = new Set(pppoeUsers(c).map((u) => u.toLowerCase()))
  const out: { client: Client; why: "phone" | "pppoe" }[] = []
  for (const o of list) {
    if (o.id === c.id) continue
    if (pppoeUsers(o).some((u) => users.has(u.toLowerCase()))) out.push({ client: o, why: "pppoe" })
    else if ([o.phone, o.whatsapp].map(phone10).some((x) => phones.has(x))) out.push({ client: o, why: "phone" })
  }
  return out.slice(0, 5)
}

/** The same client: a PPPoE user in common, or (when either has none) the same name, building and apartment. */
export function sameClient(a: Client, b: Client): boolean {
  const ua = pppoeUsers(a).map((x) => x.toLowerCase())
  const ub = pppoeUsers(b).map((x) => x.toLowerCase())
  if (ua.length && ub.length) return ua.some((x) => ub.includes(x))
  return !!a.name && norm(a.name) === norm(b.name) && norm(a.building) === norm(b.building) && norm(a.apartment) === norm(b.apartment)
}

const EMPTY = (v: unknown) => v === "" || v === null
function fillFields<T extends Record<string, unknown>>(base: T, inc: T, skip: string[]): { out: T; changed: boolean } {
  const out = { ...base }
  let changed = false
  for (const k of Object.keys(inc)) {
    if (skip.includes(k)) continue
    if (EMPTY(out[k]) && !EMPTY(inc[k])) {
      ;(out as Record<string, unknown>)[k] = inc[k]
      changed = true
    }
  }
  return { out, changed }
}

/** The matching service of `base` for an incoming one: same PPPoE user, else the first of that type. */
function matchService(base: Service[], s: Service): number {
  if (s.type === "internet" && s.pppoeUser) {
    const k = base.findIndex((x) => x.type === "internet" && x.pppoeUser.toLowerCase() === s.pppoeUser.toLowerCase())
    if (k >= 0) return k
    if (base.some((x) => x.type === "internet" && x.pppoeUser)) return -1
  }
  return base.findIndex((x) => x.type === s.type)
}

/** Fills only the empty fields of `base` from `incoming` and adds the services it lacks (an import never overwrites what was typed). */
export function fillEmpty(base: Client, incoming: Client): { client: Client; changed: boolean } {
  const f = fillFields(base, incoming, ["id", "kind", "createdAt", "updatedAt", "contacts", "services", "promiseDate", "promiseNote", "remindedAt"])
  let changed = f.changed
  const services = [...base.services]
  for (const s of incoming.services) {
    const k = matchService(services, s)
    if (k < 0) {
      services.push(s)
      changed = true
      continue
    }
    const r = fillFields(services[k], s, ["id", "type", "status", "cancelledAt", "cancelReason", "cancelNote", "priceHistory", "rxHistory"])
    if (r.changed) {
      services[k] = r.out
      changed = true
    }
  }
  return { client: { ...f.out, services }, changed }
}

/** Imported clients into the list: new ones added, known ones only filled. */
export function mergeClients(saved: Client[], incoming: Client[]): { list: Client[]; added: Client[]; filled: Client[]; same: number } {
  const list = [...saved]
  const added: Client[] = []
  const filled: Client[] = []
  let same = 0
  for (const inc of incoming) {
    const k = list.findIndex((x) => sameClient(x, inc))
    if (k < 0) {
      list.push(inc)
      added.push(inc)
      continue
    }
    const r = fillEmpty(list[k], inc)
    if (r.changed) {
      list[k] = r.client
      const j = filled.findIndex((x) => x.id === r.client.id)
      if (j >= 0) filled[j] = r.client
      else if (!added.some((x) => x.id === r.client.id)) filled.push(r.client)
      else added[added.findIndex((x) => x.id === r.client.id)] = r.client
    } else same++
  }
  return { list, added, filled, same }
}

export const clientLabel = (c: Client) => c.name.trim() || pppoeUsers(c)[0] || [c.building, c.tower, c.apartment].filter(Boolean).join(" ") || "—"

/** The service's price for a month: the earlier price whose period covers it, else the current one. */
export function priceAt(s: Pick<Service, "monthly" | "priceHistory">, month: string): number | null {
  for (const p of s.priceHistory) if (month <= p.until) return p.monthly
  return s.monthly
}

/**
 * A new price typed on a service (owner, 2026-11-19: price changes are dated): the price it had keeps applying up to
 * and including the current month, the new one from next month, so months already charged don't change. Several edits
 * in the same month are one change; going back to the earlier price undoes it. Nothing is kept when the service had
 * no price yet or starts this month or later (no month has been charged).
 */
export function setPrice(s: Service, monthly: number | null, currentMonth: string): Service {
  const hist = s.priceHistory.filter((p) => p.until < currentMonth)
  const thisMonth = s.priceHistory.find((p) => p.until === currentMonth)
  const before = thisMonth ? thisMonth.monthly : s.monthly
  // Months already charged: any before this one, and this one when the service was installed in it by the 15th.
  const charged = before !== null && (!s.start || s.start.slice(0, 7) < currentMonth || (s.start.slice(0, 7) === currentMonth && Number(s.start.slice(8, 10)) <= 15))
  if (!charged || before === monthly) return { ...s, monthly, priceHistory: hist }
  return { ...s, monthly, priceHistory: [...hist, { until: currentMonth, monthly: before }] }
}

/** A client's fiscal data as stored: upper-case RFC (12 or 13), codes as digits/letters, never throws. */
export function decodeFiscal(v: unknown): Fiscal {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const s = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "")
  return {
    rfc: s(o.rfc, 13).toUpperCase(),
    name: s(o.name, 254).toUpperCase(),
    regime: s(o.regime, 3),
    zip: s(o.zip, 5),
    use: s(o.use, 4).toUpperCase(),
    email: s(o.email, 200),
  }
}
