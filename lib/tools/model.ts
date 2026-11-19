/**
 * Tools (/interno/admin/herramientas, owner 2026-11-18: "all the necessary tools like pliers, thermo fuser, etc";
 * answers: where it is / who has it, maintenance, purchase; only the current holder (no lending history); no kits; start
 * with the usual FTTH tools).
 *
 * A record is one tool or a set of the same tool (`quantity`): name, category, brand, model, serial, condition;
 * where it is (warehouse, a technician, a deployment location from Despliegues, a vehicle, other); the purchase (price
 * per piece with IVA, supplier from Proveedores, date, warranty, invoice); maintenance (every how many months, a log of
 * services whose latest date is the last service, and a counter such as the splicer's electrode arcs with its limit).
 *
 * Synced through the database like the other sections (kind "tools"). The starter list has fixed ids, so every browser's
 * untouched copy is the same and is never uploaded. `decodeTool` reads stored or synced values field by field and never
 * throws.
 */
import { newId } from "../survey/id"

export const TOOL_CATEGORIES = ["empalme", "medicion", "corte", "limpieza", "mano", "electrica", "altura", "seguridad", "otros"] as const
export type ToolCategory = (typeof TOOL_CATEGORIES)[number]
export const CONDITIONS = ["bien", "reparacion", "danada", "perdida"] as const
export type Condition = (typeof CONDITIONS)[number]
export const HOLDER_KINDS = ["bodega", "tecnico", "despliegue", "vehiculo", "otro"] as const
export type HolderKind = (typeof HOLDER_KINDS)[number]

export type ServiceEntry = { id: string; date: string; what: string; cost: number | null; by: string }

export type Tool = {
  id: string
  name: string
  category: ToolCategory
  brand: string
  model: string
  serial: string
  quantity: number
  condition: Condition
  /** Where it is now. */
  holderKind: HolderKind
  /** The technician's, vehicle's or other place's name (not used for the warehouse or a location). */
  holder: string
  /** The location from /interno/admin/despliegues when holderKind is "despliegue". */
  siteId: string
  /** MXN per piece with IVA included; null = not known. */
  price: number | null
  /** From /interno/admin/proveedores, or "" (then `supplier` says who). */
  supplierId: string
  supplier: string
  purchaseDate: string
  warrantyEnd: string
  invoice: string
  /** Service every N months (calibration, cleaning, electrodes); null = no periodic service. */
  serviceMonths: number | null
  services: ServiceEntry[]
  /** A wear counter, e.g. "Arcos del electrodo" (empty label = none). */
  counterLabel: string
  counter: number | null
  counterLimit: number | null
  /** Spare parts and consumables from the materials list (electrodes, cleaver blades, cleaning sticks…), by item id. */
  parts: string[]
  notes: string
  updatedAt: string
}

export const newServiceEntry = (p: Partial<ServiceEntry> = {}): ServiceEntry => ({ id: newId(), date: "", what: "", cost: null, by: "", ...p })

const blank = (): Omit<Tool, "id" | "name" | "category"> => ({
  brand: "",
  model: "",
  serial: "",
  quantity: 1,
  condition: "bien",
  holderKind: "bodega",
  holder: "",
  siteId: "",
  price: null,
  supplierId: "",
  supplier: "",
  purchaseDate: "",
  warrantyEnd: "",
  invoice: "",
  serviceMonths: null,
  services: [],
  counterLabel: "",
  counter: null,
  counterLimit: null,
  parts: [],
  notes: "",
  updatedAt: "",
})

export const newTool = (p: Partial<Tool> = {}): Tool => ({ id: newId(), name: "", category: "otros", ...blank(), ...p })

// ── Starter list ────────────────────────────────────────────────────────────

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
const starter = (name: string, category: ToolCategory, p: Partial<Tool> = {}): Tool => ({ id: `starter-${slug(name)}`.slice(0, 64), name, category, ...blank(), quantity: 0, ...p })

/** The usual FTTH installation tools, quantity 0 and no price until the owner fills them in (fixed ids). */
export function starterTools(): Tool[] {
  return [
    starter("Fusionadora de fibra óptica", "empalme", { serviceMonths: 12, counterLabel: "Arcos del electrodo" }),
    starter("Cortadora de precisión (cleaver)", "empalme", { counterLabel: "Cortes de la cuchilla" }),
    starter("Peladora de fibra de 3 orificios", "corte"),
    starter("Peladora de cable drop", "corte"),
    starter("Tijeras para kevlar", "corte"),
    starter("Cortador de tubo buffer", "corte"),
    starter("Pinzas de corte diagonal", "corte"),
    starter("Pinzas de electricista", "mano"),
    starter("Pinzas de punta", "mano"),
    starter("Pistola de calor", "empalme"),
    starter("Herramienta para conectores rápidos SC/APC", "empalme"),
    starter("Medidor de potencia óptica", "medicion", { serviceMonths: 12 }),
    starter("Medidor de potencia PON (1310/1490/1550)", "medicion", { serviceMonths: 12 }),
    starter("Fuente de luz láser", "medicion", { serviceMonths: 12 }),
    starter("Localizador visual de fallas (VFL)", "medicion"),
    starter("OTDR", "medicion", { serviceMonths: 12 }),
    starter("Microscopio de inspección de conectores", "medicion"),
    starter("Multímetro", "medicion"),
    starter("Probador de cable de red", "medicion"),
    starter("Limpiador de conectores one-click", "limpieza", { counterLabel: "Limpiezas" }),
    starter("Dispensador de alcohol isopropílico", "limpieza"),
    starter("Ponchadora RJ45", "mano"),
    starter("Guía pasacables", "mano"),
    starter("Juego de desarmadores", "mano"),
    starter("Etiquetadora", "mano"),
    starter("Taladro inalámbrico", "electrica"),
    starter("Rotomartillo", "electrica"),
    starter("Escalera de tijera", "altura"),
    starter("Escalera extensible", "altura"),
    starter("Arnés de seguridad", "seguridad", { serviceMonths: 12 }),
    starter("Casco", "seguridad"),
    starter("Lentes de seguridad", "seguridad"),
    starter("Lámpara de cabeza", "mano"),
    starter("Caja de herramientas", "mano"),
  ]
}

const STARTERS = new Map(starterTools().map((x) => [x.id, x]))
/** A starter nobody touched: the same fixed id and values in every browser, so there is nothing to upload. */
export function untouchedStarter(x: Tool) {
  const s = STARTERS.get(x.id)
  if (!s) return false
  const keys = Object.keys(s).filter((k) => k !== "updatedAt")
  return keys.every((k) => JSON.stringify(s[k as keyof Tool]) === JSON.stringify(x[k as keyof Tool]))
}

// ── Derived values ──────────────────────────────────────────────────────────

/** The date of the latest service in the log ("" = none). */
export const lastService = (x: Tool) => x.services.reduce((a, s) => (s.date > a ? s.date : a), "")

/** yyyy-mm-dd plus whole months (day kept when the month has it, else its last day). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`
}

/** When the next service is due ("" = no periodic service). Without a service yet, counted from the purchase. */
export function nextService(x: Tool) {
  if (!x.serviceMonths) return ""
  const from = lastService(x) || x.purchaseDate
  return from ? addMonths(from, x.serviceMonths) : ""
}

export type Alert = "service-overdue" | "service-soon" | "service-unknown" | "counter-limit" | "counter-near" | "condition" | "warranty-soon"

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

/** What needs attention, as of `today` (yyyy-mm-dd, the phone's date). */
export function toolAlerts(x: Tool, today: string): Alert[] {
  const out: Alert[] = []
  if (x.serviceMonths) {
    const next = nextService(x)
    if (!next) out.push("service-unknown")
    else if (next < today) out.push("service-overdue")
    else if (days(today, next) <= 30) out.push("service-soon")
  }
  // Only while the counter has a name: the editor hides its fields without one, so an alert then couldn't be cleared.
  if (x.counterLabel.trim() && x.counterLimit && x.counter !== null) {
    if (x.counter >= x.counterLimit) out.push("counter-limit")
    else if (x.counter >= x.counterLimit * 0.9) out.push("counter-near")
  }
  if (x.condition !== "bien") out.push("condition")
  if (x.warrantyEnd && x.warrantyEnd >= today && days(today, x.warrantyEnd) <= 30) out.push("warranty-soon")
  return out
}

/** Value of the record: price per piece × pieces (null when there is no price). */
export const toolValue = (x: Tool) => (x.price === null ? null : x.price * x.quantity)

/** Brands the team prefers per kind of tool, first in the brand suggestions (owner, 2026-11-18: Signal Fire for the fusion splicer). */
export const PREFERRED_TOOL_BRANDS: Partial<Record<ToolCategory, string[]>> = { empalme: ["Signal Fire"] }

/** Brand suggestions for a tool: the preferred ones for its kind, then every brand already used (once, ignoring case), A–Z. */
export function toolBrandOptions(category: ToolCategory, tools: Pick<Tool, "brand">[]): string[] {
  const first = PREFERRED_TOOL_BRANDS[category] ?? []
  const seen = new Set(first.map((b) => b.toLowerCase()))
  const used: string[] = []
  for (const x of tools) {
    const b = x.brand.trim()
    if (!b || seen.has(b.toLowerCase())) continue
    seen.add(b.toLowerCase())
    used.push(b)
  }
  return [...first, ...used.sort((a, b) => a.localeCompare(b, "es"))]
}

export const toolLabel = (x: Tool) => [x.name || "Sin nombre", x.brand, x.model].filter(Boolean).join(" · ")

/** Who or where, for lists: the warehouse, the person, the vehicle, or the location's name. */
export function holderLabel(x: Tool, siteName: (id: string) => string | undefined, kindLabel: (k: HolderKind) => string) {
  if (x.holderKind === "despliegue") return siteName(x.siteId) ?? kindLabel("despliegue")
  if (x.holderKind === "bodega") return kindLabel("bodega")
  return x.holder.trim() || kindLabel(x.holderKind)
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null)
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const ID = /^[\w-]{6,64}$/
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "")
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

export function decodeTool(v: unknown): Tool | null {
  if (!isObj(v)) return null
  const services = Array.isArray(v.services)
    ? v.services
        .filter(isObj)
        .slice(0, 200)
        .map((s) => ({ id: id(s.id) || newId(), date: date(s.date), what: str(s.what, 500), cost: num(s.cost, 0, 1e7), by: str(s.by, 100) }))
    : []
  const quantity = num(v.quantity, 0, 100000)
  return {
    id: id(v.id) || newId(),
    name: str(v.name, 200),
    category: pick(TOOL_CATEGORIES, v.category, "otros"),
    brand: str(v.brand, 100),
    model: str(v.model, 100),
    serial: str(v.serial, 100).toUpperCase(),
    quantity: quantity === null ? 1 : Math.round(quantity),
    condition: pick(CONDITIONS, v.condition, "bien"),
    holderKind: pick(HOLDER_KINDS, v.holderKind, "bodega"),
    holder: str(v.holder, 100),
    siteId: id(v.siteId),
    price: num(v.price, 0, 1e8),
    supplierId: id(v.supplierId),
    supplier: str(v.supplier, 200),
    purchaseDate: date(v.purchaseDate),
    warrantyEnd: date(v.warrantyEnd),
    invoice: str(v.invoice, 100),
    serviceMonths: num(v.serviceMonths, 1, 120),
    services,
    counterLabel: str(v.counterLabel, 60),
    counter: num(v.counter, 0, 1e9),
    counterLimit: num(v.counterLimit, 1, 1e9),
    parts: Array.isArray(v.parts) ? [...new Set(v.parts.map(id).filter(Boolean))].slice(0, 50) : [],
    notes: str(v.notes, 2000),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
