/**
 * Subscribers (/interno/admin/clientes, owner 2026-11-17): contact, where they live (building, tower, apartment),
 * service (plan, TV, install date, monthly price, status), equipment and network (ONT model and serial, PPPoE user,
 * deployment, OLT port, ONT id) and billing notes (payment day and method; no billing system, the owner controls it
 * by hand). Personal data: only behind the /interno password, synced through the database like surveys.
 *
 * `decodeClient` reads stored, imported or synced values field by field and never throws. `mergeClient` is the
 * import rule: a client already in the list (same PPPoE user, or same name + building + apartment) only gets its
 * empty fields filled; nothing typed by hand is overwritten.
 */
import { newId } from "../survey/id"

export const CLIENT_STATUSES = ["activo", "suspendido", "cancelado"] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]
export const PAY_METHODS = ["", "efectivo", "transferencia", "tarjeta", "deposito", "otro"] as const
export type PayMethod = (typeof PAY_METHODS)[number]

export type Client = {
  id: string
  name: string
  phone: string
  whatsapp: string
  email: string
  building: string
  tower: string
  apartment: string
  plan: string
  tv: boolean
  /** YYYY-MM-DD or "". */
  installDate: string
  /** MXN with IVA, per month; null = not set. */
  monthly: number | null
  status: ClientStatus
  ontModel: string
  ontSn: string
  pppoeUser: string
  deployment: string
  /** OLT frame/slot/port, e.g. 0/1/3. */
  oltPort: string
  ontId: number | null
  payDay: number | null
  payMethod: PayMethod
  notes: string
  /** The website request it came from, if any. */
  leadId: string
  createdAt: string
  updatedAt: string
}

export function newClient(p: Partial<Client> = {}): Client {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name: "",
    phone: "",
    whatsapp: "",
    email: "",
    building: "",
    tower: "",
    apartment: "",
    plan: "",
    tv: false,
    installDate: "",
    monthly: null,
    status: "activo",
    ontModel: "EG8145B7-50",
    ontSn: "",
    pppoeUser: "",
    deployment: "",
    oltPort: "",
    ontId: null,
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

export function decodeClient(v: unknown): Client | null {
  if (!isObj(v)) return null
  const id = typeof v.id === "string" && /^[\w-]{6,64}$/.test(v.id) ? v.id : newId()
  return {
    id,
    name: str(v.name, 200),
    phone: str(v.phone, 40),
    whatsapp: str(v.whatsapp, 40),
    email: str(v.email, 200),
    building: str(v.building, 200),
    tower: str(v.tower, 60),
    apartment: str(v.apartment, 60),
    plan: str(v.plan, 80),
    tv: v.tv === true,
    installDate: date(v.installDate),
    monthly: num(v.monthly, 0, 1e6),
    status: (CLIENT_STATUSES as readonly unknown[]).includes(v.status) ? (v.status as ClientStatus) : "activo",
    ontModel: str(v.ontModel, 60),
    ontSn: str(v.ontSn, 40).toUpperCase(),
    pppoeUser: str(v.pppoeUser, 64),
    deployment: str(v.deployment, 120),
    oltPort: str(v.oltPort, 20),
    ontId: num(v.ontId, 0, 255),
    payDay: num(v.payDay, 1, 31),
    payMethod: (PAY_METHODS as readonly unknown[]).includes(v.payMethod) ? (v.payMethod as PayMethod) : "",
    notes: str(v.notes, 4000),
    leadId: str(v.leadId, 64),
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
  }
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

/** The same subscriber: same PPPoE user, or (without one) same name, building and apartment. */
export function sameClient(a: Client, b: Client): boolean {
  if (a.pppoeUser && b.pppoeUser) return a.pppoeUser.toLowerCase() === b.pppoeUser.toLowerCase()
  return !!a.name && norm(a.name) === norm(b.name) && norm(a.building) === norm(b.building) && norm(a.apartment) === norm(b.apartment)
}

/** Fills only the empty fields of `base` from `incoming` (an import never overwrites what was typed). */
export function fillEmpty(base: Client, incoming: Client): { client: Client; changed: boolean } {
  const out: Client = { ...base }
  let changed = false
  for (const k of Object.keys(incoming) as (keyof Client)[]) {
    if (k === "id" || k === "createdAt" || k === "updatedAt" || k === "status" || k === "tv") continue
    const cur = out[k]
    const inc = incoming[k]
    const empty = cur === "" || cur === null
    const has = inc !== "" && inc !== null
    if (empty && has) {
      ;(out as Record<string, unknown>)[k] = inc
      changed = true
    }
  }
  return { client: out, changed }
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
      filled.push(r.client)
    } else same++
  }
  return { list, added, filled, same }
}

export const clientLabel = (c: Client) => c.name.trim() || c.pppoeUser || [c.building, c.tower, c.apartment].filter(Boolean).join(" ") || "—"
