/**
 * Installation stock (owner, 2026-11-18: "the stock that we have for apartment installations or replacements"; kept
 * in the warehouse and in each location's telecom room; ONTs tracked one by one by serial number).
 *
 * Stock is a log of movements, never a number typed over another one, so two phones recording movements offline
 * never overwrite each other: what a place has = what went in − what went out.
 * - compra: from a supplier into a place;
 * - traspaso: from one place to another (warehouse → a building's room);
 * - instalacion / reemplazo: from a place to a client (a new installation, or a part replaced);
 * - devolucion: from a client back to a place (an ONT recovered after a cancellation, a replaced one that still works);
 * - baja: out of a place for good (damaged, lost);
 * - ajuste: an inventory count correction (+ or −).
 * Places: the warehouse ("bodega") or a location from Despliegues ("s:<id>").
 *
 * Items marked `serialized` (the ONT by default) are also kept as units, one per serial number, with where each one
 * is now (in a place, at a client, damaged, lost, back to the supplier); their count is the units in the place. A
 * movement of such an item names its serials and moves those units.
 */
import { newId } from "../survey/id"

export const BODEGA = "bodega"
export const MOVE_KINDS = ["compra", "traspaso", "instalacion", "reemplazo", "devolucion", "baja", "ajuste"] as const
export type MoveKind = (typeof MOVE_KINDS)[number]
export const UNIT_STATES = ["almacen", "cliente", "danado", "perdido", "proveedor"] as const
export type UnitState = (typeof UNIT_STATES)[number]
/** Why something leaves for good (a baja): damaged, lost, or sent back to the supplier. */
export const BAJA_REASONS = ["danado", "perdido", "proveedor"] as const
export type BajaReason = (typeof BAJA_REASONS)[number]

export type Move = {
  id: string
  kind: MoveKind
  date: string
  itemId: string
  /** Pieces or meters; for an ajuste it can be negative. For serialized items, the number of serials. */
  qty: number
  /** The place it leaves ("" when it comes from a supplier or a client). */
  from: string
  /** The place it enters ("" when it goes to a client or out). */
  to: string
  /** The client it went to or came from (instalacion, reemplazo, devolucion). */
  clientId: string
  serials: string[]
  /** Movements recorded together (one installation with its ONT, drop cable and connectors). */
  batch: string
  /** A baja's reason (its units take that state); "" for the other kinds. */
  reason: BajaReason | ""
  notes: string
  by: string
  updatedAt: string
}

export type Unit = {
  id: string
  itemId: string
  serial: string
  state: UnitState
  /** The place, while in a place (almacen) or damaged there. */
  place: string
  /** The client who has it (state cliente). */
  clientId: string
  notes: string
  updatedAt: string
}

export const newMove = (p: Partial<Move> = {}): Move => ({ id: newId(), kind: "compra", date: "", itemId: "", qty: 0, from: "", to: "", clientId: "", serials: [], batch: "", reason: "", notes: "", by: "", updatedAt: "", ...p })
export const newUnit = (p: Partial<Unit> = {}): Unit => ({ id: newId(), itemId: "", serial: "", state: "almacen", place: BODEGA, clientId: "", notes: "", updatedAt: "", ...p })

export const sitePlace = (siteId: string) => `s:${siteId}`
export const placeSite = (place: string) => (place.startsWith("s:") ? place.slice(2) : "")
export const normSerial = (s: string) => s.replace(/\s+/g, "").toUpperCase()

/** Which ends a kind of movement uses. */
export const ENDS: Record<MoveKind, { from: boolean; to: boolean; client: boolean }> = {
  compra: { from: false, to: true, client: false },
  traspaso: { from: true, to: true, client: false },
  instalacion: { from: true, to: false, client: true },
  reemplazo: { from: true, to: false, client: true },
  devolucion: { from: false, to: true, client: true },
  baja: { from: true, to: false, client: false },
  ajuste: { from: false, to: true, client: false },
}

/** What a place has of a non-serialized item: in − out. */
export function stockAt(moves: Move[], itemId: string, place: string): number {
  let n = 0
  for (const m of moves) {
    if (m.itemId !== itemId) continue
    if (m.to === place) n += m.qty
    if (m.from === place) n -= m.qty
  }
  return Math.round(n * 1000) / 1000
}

/** Units of an item in a place, ready to use. */
export const unitsAt = (units: Unit[], itemId: string, place: string) => units.filter((u) => u.itemId === itemId && u.state === "almacen" && u.place === place)

/** The count of any item in a place (units for serialized items, movements for the rest). */
export const countAt = (item: { id: string; serialized: boolean }, moves: Move[], units: Unit[], place: string) => (item.serialized ? unitsAt(units, item.id, place).length : stockAt(moves, item.id, place))

/** Every place that has had a movement or a unit (the warehouse first). */
export function placesUsed(moves: Move[], units: Unit[]): string[] {
  const set = new Set<string>([BODEGA])
  for (const m of moves) for (const p of [m.from, m.to]) if (p) set.add(p)
  for (const u of units) if (u.place) set.add(u.place)
  return [...set]
}

/**
 * What the stock of a place is worth: pieces (or meters) × each item's price (MXN with IVA). Items with stock but
 * without a price are counted apart, so the total says it's incomplete.
 */
export function stockValue(items: { id: string; serialized: boolean; price: number | null }[], moves: Move[], units: Unit[], place: string): { value: number; unpriced: number } {
  let value = 0
  let unpriced = 0
  for (const it of items) {
    const n = countAt(it, moves, units, place)
    if (n <= 0) continue
    if (it.price === null) unpriced++
    else value += n * it.price
  }
  return { value: Math.round(value * 100) / 100, unpriced }
}

/** Movements that use stock up (to a client, or out for good). */
const USE_KINDS: MoveKind[] = ["instalacion", "reemplazo", "baja"]

/** Days between two yyyy-mm-dd dates. */
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

/**
 * What an item uses per month: the pieces (or meters) that went to clients or out for good in the last `days` days,
 * as a 30-day average. Null when nothing went out in that time.
 */
export function monthlyUse(moves: Move[], itemId: string, today: string, days = 90): number | null {
  let n = 0
  for (const m of moves) {
    if (m.itemId !== itemId || !USE_KINDS.includes(m.kind) || !m.date) continue
    const ago = dayDiff(m.date, today)
    if (ago >= 0 && ago < days) n += Math.abs(m.qty)
  }
  return n > 0 ? Math.round((n / days) * 30 * 10) / 10 : null
}

/** A suggested minimum for the warehouse: one month of use, rounded up (null without use to go by). */
export const suggestedMin = (monthly: number | null) => (monthly === null ? null : Math.ceil(monthly))

/** Ids of the items a place still has (count above 0): what would be stranded if the place went away. */
export function placesStockItems(moves: Move[], units: Unit[], place: string, items: Map<string, { id: string; serialized: boolean }>): string[] {
  const ids = new Set([...moves.filter((m) => m.to === place || m.from === place).map((m) => m.itemId), ...units.filter((u) => u.place === place).map((u) => u.itemId)])
  return [...ids].filter((id) => {
    const it = items.get(id) ?? { id, serialized: false }
    return countAt(it, moves, units, place) > 0
  })
}

/**
 * What a movement does to the serialized units it names: units that don't exist yet are created (a purchase, or a
 * unit first seen being returned). Returns the units to save (new or changed).
 */
export function applyToUnits(units: Unit[], m: Move): Unit[] {
  const out: Unit[] = []
  for (const raw of m.serials) {
    const serial = normSerial(raw)
    if (!serial) continue
    const cur = units.find((u) => normSerial(u.serial) === serial) ?? out.find((u) => normSerial(u.serial) === serial)
    const u = cur ? { ...cur } : newUnit({ itemId: m.itemId, serial })
    if (m.kind === "compra" || m.kind === "devolucion" || m.kind === "traspaso" || m.kind === "ajuste") Object.assign(u, { state: "almacen", place: m.to, clientId: "" })
    else if (m.kind === "instalacion" || m.kind === "reemplazo") Object.assign(u, { state: "cliente", place: "", clientId: m.clientId })
    else if (m.kind === "baja") {
      const state: UnitState = m.reason || "danado"
      // A damaged unit stays where it is (to be sent for repair); a lost one or one back with the supplier has no place.
      Object.assign(u, { state, place: state === "danado" ? m.from : "", clientId: "" })
    }
    const k = out.findIndex((x) => x.id === u.id)
    if (k >= 0) out[k] = u
    else out.push(u)
  }
  return out
}

/** Problems with a movement before saving it (stock short is only a warning: counts can be behind). */
export function checkMove(m: Move, item: { serialized: boolean } | undefined, units: Unit[], moves: Move[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const e = ENDS[m.kind]
  if (!item) errors.push("item")
  if (!m.date) errors.push("date")
  if (e.from && !m.from) errors.push("from")
  if (e.to && !m.to) errors.push("to")
  if (m.kind === "traspaso" && m.from === m.to) errors.push("same")
  if (e.client && !m.clientId) errors.push("client")
  if (item?.serialized) {
    const serials = m.serials.map(normSerial).filter(Boolean)
    if (!serials.length) errors.push("serials")
    if (new Set(serials).size !== serials.length) errors.push("repeated")
    for (const s of serials) {
      const u = units.find((x) => normSerial(x.serial) === s)
      if (m.kind === "compra" && u) warnings.push(`exists:${s}`)
      if ((m.kind === "instalacion" || m.kind === "reemplazo" || m.kind === "traspaso" || m.kind === "baja") && (!u || u.state !== "almacen" || u.place !== m.from)) warnings.push(`notThere:${s}`)
    }
  } else {
    if (m.kind === "ajuste" ? m.qty === 0 : !(m.qty > 0)) errors.push("qty")
    if (e.from && m.from && m.qty > stockAt(moves, m.itemId, m.from)) warnings.push("short")
  }
  return { errors, warnings }
}

/** ONTs (and other units) at clients who no longer have an active service: to recover. */
export function toRecover<C extends { id: string; services: { status: string }[] }>(units: Unit[], clients: C[]): Unit[] {
  return units.filter((u) => {
    if (u.state !== "cliente") return false
    const c = clients.find((x) => x.id === u.clientId)
    return !c || !c.services.length || c.services.every((s) => s.status === "cancelado")
  })
}

/** Serial numbers that appear on more than one unit (two phones registered the same ONT). */
export function repeatedSerials(units: Unit[]): Set<string> {
  const seen = new Map<string, number>()
  for (const u of units) seen.set(normSerial(u.serial), (seen.get(normSerial(u.serial)) ?? 0) + 1)
  return new Set([...seen].filter(([s, n]) => s && n > 1).map(([s]) => s))
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const ID = /^[\w-]{6,64}$/
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "")
const place = (v: unknown) => (v === BODEGA ? BODEGA : typeof v === "string" && /^s:[\w-]{6,64}$/.test(v) ? v : "")
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

export function decodeMove(v: unknown): Move | null {
  if (!isObj(v) || !id(v.itemId)) return null
  const kind = pick(MOVE_KINDS, v.kind, "ajuste")
  const qty = typeof v.qty === "number" && Number.isFinite(v.qty) && Math.abs(v.qty) <= 1e6 ? v.qty : 0
  return {
    id: id(v.id) || newId(),
    kind,
    date: date(v.date),
    itemId: id(v.itemId),
    qty: kind === "ajuste" ? qty : Math.abs(qty),
    from: place(v.from),
    to: place(v.to),
    clientId: id(v.clientId),
    serials: Array.isArray(v.serials) ? v.serials.filter((x): x is string => typeof x === "string").map((x) => normSerial(x).slice(0, 64)).filter(Boolean).slice(0, 500) : [],
    batch: id(v.batch),
    reason: kind === "baja" ? pick(BAJA_REASONS, v.reason, "danado") : "",
    notes: str(v.notes, 1000),
    by: str(v.by, 60),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}

export function decodeUnit(v: unknown): Unit | null {
  if (!isObj(v) || !id(v.itemId) || typeof v.serial !== "string" || !normSerial(v.serial)) return null
  const state = pick(UNIT_STATES, v.state, "almacen")
  return {
    id: id(v.id) || newId(),
    itemId: id(v.itemId),
    serial: normSerial(v.serial).slice(0, 64),
    state,
    place: state === "almacen" || state === "danado" ? place(v.place) || BODEGA : "",
    clientId: state === "cliente" ? id(v.clientId) : "",
    notes: str(v.notes, 1000),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
