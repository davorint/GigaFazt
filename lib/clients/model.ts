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
  /** YYYY-MM-DD or "". */
  start: string
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
}

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
  notes: string
  /** The website request it came from, if any. */
  leadId: string
  createdAt: string
  updatedAt: string
}

export const DEFAULT_ONT = "EG8145B7-50"

export function newService(type: ServiceType, p: Partial<Service> = {}): Service {
  return {
    id: newId(),
    type,
    status: "activo",
    plan: "",
    monthly: null,
    start: "",
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
    notes: "",
    leadId: "",
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
    start: date(v.start),
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
    notes: str(v.notes, 4000),
    leadId: str(v.leadId, 64),
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
  }
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
  const f = fillFields(base, incoming, ["id", "kind", "createdAt", "updatedAt", "contacts", "services"])
  let changed = f.changed
  const services = [...base.services]
  for (const s of incoming.services) {
    const k = matchService(services, s)
    if (k < 0) {
      services.push(s)
      changed = true
      continue
    }
    const r = fillFields(services[k], s, ["id", "type", "status"])
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
