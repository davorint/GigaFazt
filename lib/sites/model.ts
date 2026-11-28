/**
 * Deployment locations (/interno/admin/despliegues, owner 2026-11-17: "manage the different deployment locations, some
 * locations have 2 telecom rooms").
 *
 * A location is a condominium or building complex where we run our network:
 * - towers (floors, apartments, which telecom room serves each);
 * - contacts and access (the building's administrator, picked from the clients of type Administración, more contacts,
 *   access rules, hours, who has the keys);
 * - the agreement with the building (rent, electricity and who pays it, contract dates, notes);
 * - one or more telecom rooms, each with where it is and its access, power (breaker, UPS, battery hours), its equipment
 *   (model, serial, management IP, firmware), the carrier links that arrive there (from Proveedores) and its PON ports
 *   (which tower each feeds, splitters; clients per port counted from the clients' internet services).
 * Clients point to a location and tower (Client.siteId / towerId), so a location shows its clients and monthly total.
 *
 * Synced through the database like the surveys (kind "sites"). `decodeSite` reads stored or synced values field by
 * field and never throws.
 */
import { stateOf } from "../survey/places"
import { newId } from "../survey/id"

export const EQUIPMENT_KINDS = ["router", "olt", "switch", "ups", "otro"] as const
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number]
export const POWER_PAYERS = ["", "nosotros", "edificio", "incluido"] as const
export type PowerPayer = (typeof POWER_PAYERS)[number]
/** How the agreement renews at its end: by itself, by negotiating it, or it doesn't ("" = not said). */
export const RENEWALS = ["", "automatica", "negociar", "no"] as const
export type Renewal = (typeof RENEWALS)[number]
/** Days before the end to start the renewal when the agreement doesn't say. */
export const DEFAULT_NOTICE_DAYS = 60

export type SiteContact = { id: string; name: string; role: string; phone: string; email: string }

export type Tower = {
  id: string
  name: string
  /** Levels above the street, ground floor included. */
  floors: number | null
  apartments: number | null
  /** Levels below the street (owner, 2026-11-28; null = not said). */
  basements: number | null
  /** Apartments on each floor above the street, index 0 = planta baja (null = not counted); as long as `floors`. */
  perFloor: (number | null)[]
  /** The telecom room that serves it ("" = not set). */
  roomId: string
  notes: string
}

export type Equipment = { id: string; kind: EquipmentKind; model: string; serial: string; ip: string; firmware: string; notes: string }

export type RoomCarrier = {
  id: string
  /** From /interno/admin/proveedores ("" = not in the list: `name` says who). */
  providerId: string
  name: string
  downMbps: number | null
  upMbps: number | null
  /** Public IP, or how it arrives (NAT / CGNAT / DHCP). */
  ip: string
  account: string
  /** What we pay for this link each month, MXN with IVA (null = not set). */
  monthly: number | null
  notes: string
}

export type PonPort = {
  id: string
  /** Frame/slot/port, e.g. 0/1/0. */
  port: string
  /** The OLT it belongs to ("" = the room's only one). */
  oltId: string
  /** The tower it feeds ("" = not set). */
  towerId: string
  /** e.g. "1:8 en la base + 1:16 cada 2 pisos". */
  splitters: string
  notes: string
}

export type Room = {
  id: string
  name: string
  /** Where it is in the building (basement, roof, tower B…). */
  location: string
  access: string
  breaker: string
  upsHours: number | null
  powerNotes: string
  equipment: Equipment[]
  carriers: RoomCarrier[]
  ports: PonPort[]
}

export type Site = {
  id: string
  name: string
  address: string
  municipality: string
  /** Its state (lib/survey/places menus, or typed in). */
  state: string
  /** Its point on the map (owner, 2026-11-28; internal only, never on the public site). */
  lat: number | null
  lng: number | null
  towers: Tower[]
  /** The building's administration: a client of type Administración ("" = none). */
  adminClientId: string
  contacts: SiteContact[]
  accessRules: string
  accessHours: string
  keys: string
  rentMonthly: number | null
  powerMonthly: number | null
  powerPayer: PowerPayer
  contractStart: string
  contractEnd: string
  /** How it renews, the days of notice the agreement asks for (null = DEFAULT_NOTICE_DAYS), the yearly rent increase (%). */
  renewal: Renewal
  noticeDays: number | null
  rentIncreasePct: number | null
  agreementNotes: string
  rooms: Room[]
  notes: string
  createdAt: string
  updatedAt: string
}

export const newTower = (p: Partial<Tower> = {}): Tower => ({ id: newId(), name: "", floors: null, apartments: null, basements: null, perFloor: [], roomId: "", notes: "", ...p })
export const newEquipment = (kind: EquipmentKind, p: Partial<Equipment> = {}): Equipment => ({ id: newId(), kind, model: "", serial: "", ip: "", firmware: "", notes: "", ...p })
export const newRoomCarrier = (p: Partial<RoomCarrier> = {}): RoomCarrier => ({ id: newId(), providerId: "", name: "", downMbps: null, upMbps: null, ip: "", account: "", monthly: null, notes: "", ...p })
export const newPort = (p: Partial<PonPort> = {}): PonPort => ({ id: newId(), port: "", oltId: "", towerId: "", splitters: "", notes: "", ...p })
export const newSiteContact = (p: Partial<SiteContact> = {}): SiteContact => ({ id: newId(), name: "", role: "", phone: "", email: "", ...p })
export const newRoom = (p: Partial<Room> = {}): Room => ({
  id: newId(),
  name: "",
  location: "",
  access: "",
  breaker: "",
  upsHours: null,
  powerNotes: "",
  equipment: [],
  carriers: [],
  ports: [],
  ...p,
})

export function newSite(p: Partial<Site> = {}): Site {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name: "",
    address: "",
    municipality: "",
    state: "",
    lat: null,
    lng: null,
    towers: [],
    adminClientId: "",
    contacts: [],
    accessRules: "",
    accessHours: "",
    keys: "",
    rentMonthly: null,
    powerMonthly: null,
    powerPayer: "",
    contractStart: "",
    contractEnd: "",
    renewal: "",
    noticeDays: null,
    rentIncreasePct: null,
    agreementNotes: "",
    rooms: [newRoom({ name: "Cuarto principal" })],
    notes: "",
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
const ID = /^[\w-]{6,64}$/
const idOf = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : newId())
const ref = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "")
const list = <T>(x: unknown, f: (y: Obj) => T, max: number): T[] => (Array.isArray(x) ? x.slice(0, max).filter(isObj).map(f) : [])

const decodeContact = (v: Obj): SiteContact => ({ id: idOf(v.id), name: str(v.name, 200), role: str(v.role, 80), phone: str(v.phone, 40), email: str(v.email, 200) })
const decodeTower = (v: Obj): Tower =>
  syncPerFloor({
    id: idOf(v.id),
    name: str(v.name, 80),
    floors: num(v.floors, 0, 200),
    apartments: num(v.apartments, 0, 5000),
    basements: num(v.basements, 0, 20),
    perFloor: Array.isArray(v.perFloor) ? v.perFloor.slice(0, 200).map((x) => num(x, 0, 500)) : [],
    roomId: ref(v.roomId),
    notes: str(v.notes, 2000),
  })
const decodeEquipment = (v: Obj): Equipment => ({
  id: idOf(v.id),
  kind: oneOf(EQUIPMENT_KINDS, v.kind, "otro"),
  model: str(v.model, 80),
  serial: str(v.serial, 60).toUpperCase(),
  ip: str(v.ip, 60),
  firmware: str(v.firmware, 60),
  notes: str(v.notes, 2000),
})
const decodeCarrier = (v: Obj): RoomCarrier => ({
  id: idOf(v.id),
  providerId: ref(v.providerId),
  name: str(v.name, 120),
  downMbps: num(v.downMbps, 0, 1e6),
  upMbps: num(v.upMbps, 0, 1e6),
  ip: str(v.ip, 60),
  account: str(v.account, 80),
  monthly: num(v.monthly, 0, 1e7),
  notes: str(v.notes, 2000),
})
const decodePort = (v: Obj): PonPort => ({ id: idOf(v.id), port: str(v.port, 20), oltId: ref(v.oltId), towerId: ref(v.towerId), splitters: str(v.splitters, 200), notes: str(v.notes, 2000) })
const decodeRoom = (v: Obj): Room => ({
  id: idOf(v.id),
  name: str(v.name, 80),
  location: str(v.location, 200),
  access: str(v.access, 2000),
  breaker: str(v.breaker, 120),
  upsHours: num(v.upsHours, 0, 1000),
  powerNotes: str(v.powerNotes, 2000),
  equipment: list(v.equipment, decodeEquipment, 60),
  carriers: list(v.carriers, decodeCarrier, 20),
  ports: list(v.ports, decodePort, 300),
})

export function decodeSite(v: unknown): Site | null {
  if (!isObj(v)) return null
  const rooms = list(v.rooms, decodeRoom, 10)
  const roomIds = new Set(rooms.map((r) => r.id))
  const towers = list(v.towers, decodeTower, 60).map((t) => (t.roomId && !roomIds.has(t.roomId) ? { ...t, roomId: "" } : t))
  const towerIds = new Set(towers.map((t) => t.id))
  return {
    id: idOf(v.id),
    name: str(v.name, 200),
    address: str(v.address, 300),
    municipality: str(v.municipality, 120),
    // Deployments from before the menus (2026-11-20): a listed municipality fills its state.
    state: str(v.state, 80) || stateOf(str(v.municipality, 120)),
    // Both or neither: half a point can't be placed.
    ...(num(v.lat, -90, 90) !== null && num(v.lng, -180, 180) !== null ? { lat: v.lat as number, lng: v.lng as number } : { lat: null, lng: null }),
    towers,
    adminClientId: ref(v.adminClientId),
    contacts: list(v.contacts, decodeContact, 30),
    accessRules: str(v.accessRules, 4000),
    accessHours: str(v.accessHours, 200),
    keys: str(v.keys, 1000),
    rentMonthly: num(v.rentMonthly, 0, 1e7),
    powerMonthly: num(v.powerMonthly, 0, 1e7),
    powerPayer: oneOf(POWER_PAYERS, v.powerPayer, ""),
    contractStart: date(v.contractStart),
    contractEnd: date(v.contractEnd),
    renewal: oneOf(RENEWALS, v.renewal, ""),
    noticeDays: num(v.noticeDays, 0, 730),
    rentIncreasePct: num(v.rentIncreasePct, 0, 100),
    agreementNotes: str(v.agreementNotes, 4000),
    // A port's tower or OLT that no longer exists reads as "not set".
    rooms: rooms.map((r) => {
      const olts = new Set(r.equipment.filter((e) => e.kind === "olt").map((e) => e.id))
      return { ...r, ports: r.ports.map((p) => ({ ...p, towerId: towerIds.has(p.towerId) ? p.towerId : "", oltId: olts.has(p.oltId) ? p.oltId : "" })) }
    }),
    notes: str(v.notes, 4000),
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
  }
}

export const siteLabel = (s: Site) => s.name.trim() || s.address.trim() || "Sin nombre"
export const towerLabel = (t: Tower, i: number) => t.name.trim() || `Torre ${i + 1}`
export const roomLabel = (r: Room, i: number) => r.name.trim() || `Cuarto ${i + 1}`

/** The units-per-floor list as long as the tower's floors: extra floors dropped, new ones not counted yet. */
export function syncPerFloor(t: Tower): Tower {
  const n = t.floors ?? 0
  return { ...t, perFloor: Array.from({ length: n }, (_, i) => t.perFloor[i] ?? null) }
}

/** A tower's apartments: the floors' sum once any floor is counted, else the typed total. */
export function towerApartments(t: Tower): number | null {
  const counted = t.perFloor.filter((x): x is number => x !== null)
  return counted.length ? counted.reduce((a, b) => a + b, 0) : t.apartments
}

/**
 * Sets one floor's units; the tower's stored total follows the floors' sum once any is counted, so every reader of
 * `apartments` (Números, Tablero) agrees with the floors.
 */
export function setFloorUnits(t: Tower, floor: number, units: number | null): Tower {
  const perFloor = syncPerFloor(t).perFloor.map((x, i) => (i === floor ? units : x))
  const next = { ...t, perFloor }
  return { ...next, apartments: perFloor.some((x) => x !== null) ? towerApartments(next) : t.apartments }
}

/** "19.3612, -99.1641" (as Google Maps copies it; comma, semicolon or space) → the point, or null. */
export function parsePoint(v: string): { lat: number; lng: number } | null {
  const m = v.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

/** The sheet's blocks, in page order (each one an anchor). */
export const SHEET_SECTIONS = ["general", "torres", "cuartos", "acuerdo", "acceso", "clientes", "levantamiento", "sitio"] as const
export type SheetSection = (typeof SHEET_SECTIONS)[number]
export type MissingField = { key: string; section: SheetSection }

/**
 * What a deployment still lacks (owner, 2026-11-28: the data comes in out of order), in page order. `key` is the
 * field's anchor on the sheet (`InlineField` id), so the "faltan" chip can jump to it.
 */
export function missingFields(s: Site): MissingField[] {
  const out: MissingField[] = []
  const need = (ok: boolean, key: string, section: SheetSection) => ok || out.push({ key, section })
  need(!!s.name.trim(), "name", "general")
  need(!!s.address.trim(), "address", "general")
  need(!!s.state.trim(), "state", "general")
  need(!!s.municipality.trim(), "municipality", "general")
  need(s.lat !== null && s.lng !== null, "location", "general")
  need(s.towers.length > 0, "towers", "torres")
  for (const t of s.towers) {
    need(t.floors !== null, `tower.${t.id}.floors`, "torres")
    need(towerApartments(t) !== null, `tower.${t.id}.apartments`, "torres")
    need(!!t.roomId || s.rooms.length === 0, `tower.${t.id}.room`, "torres")
  }
  for (const r of s.rooms) {
    need(!!r.location.trim(), `room.${r.id}.location`, "cuartos")
    need(!!r.breaker.trim(), `room.${r.id}.breaker`, "cuartos")
    for (const c of r.carriers) {
      need(c.downMbps !== null, `carrier.${c.id}.down`, "cuartos")
      need(c.monthly !== null, `carrier.${c.id}.monthly`, "cuartos")
    }
  }
  need(!!s.contractStart, "agreement.start", "acuerdo")
  need(!!s.contractEnd, "agreement.end", "acuerdo")
  need(s.rentMonthly !== null, "agreement.rent", "acuerdo")
  need(!!s.powerPayer, "agreement.powerPayer", "acuerdo")
  need(!!s.adminClientId || s.contacts.some((c) => c.name.trim() || c.phone.trim()), "access.contact", "acceso")
  need(!!s.accessHours.trim(), "access.hours", "acceso")
  return out
}

/** Normalizes "0/1/0", "0-1-0", "0 / 1 / 0" so ports typed on a client and on a room compare equal. */
export const normPort = (p: string) => p.replace(/\s+/g, "").replace(/[-.]/g, "/")

/** What a location costs per month (rent + electricity when we pay it). */
export const siteCost = (s: Site) => (s.rentMonthly ?? 0) + (s.powerPayer === "nosotros" ? (s.powerMonthly ?? 0) : 0)

/** What the location's internet links cost each month (every carrier of every room with a price). */
export const linksCost = (s: Site) => s.rooms.reduce((a, r) => a + r.carriers.reduce((b, c) => b + (c.monthly ?? 0), 0), 0)

/** Carriers in the location without a monthly price (the profit then counts them as 0). */
export const unpricedLinks = (s: Site) => s.rooms.reduce((a, r) => a + r.carriers.filter((c) => c.monthly === null).length, 0)

/** Monthly profit of a location: its clients' active services − the building (rent, power) − its internet links. */
export const siteProfit = (s: Site, income: number) => income - siteCost(s) - linksCost(s)

/** The capacity of the room's carriers (sum of their download speeds), null when none has one. */
export function roomCapacity(r: Room): number | null {
  const v = r.carriers.map((c) => c.downMbps).filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

/** Deletes a tower and clears the references to it (ports). */
export function removeTower(s: Site, towerId: string): Site {
  return { ...s, towers: s.towers.filter((t) => t.id !== towerId), rooms: s.rooms.map((r) => ({ ...r, ports: r.ports.map((p) => (p.towerId === towerId ? { ...p, towerId: "" } : p)) })) }
}

/** Deletes a room and clears the towers that pointed to it. */
export function removeRoom(s: Site, roomId: string): Site {
  return { ...s, rooms: s.rooms.filter((r) => r.id !== roomId), towers: s.towers.map((t) => (t.roomId === roomId ? { ...t, roomId: "" } : t)) }
}

export type AgreementStatus = "sin-fecha" | "vigente" | "por-vencer" | "vencido" | "renovado"

/** yyyy-mm-dd plus whole years (Feb 29 → Feb 28). */
const plusYears = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number)
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate()
  return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

/**
 * Where a building's agreement stands (owner, 2026-11-19): no end date; in force; within its notice period (time to
 * renew or negotiate); ended. An automatic renewal past its end rolls forward a year at a time ("renovado"), and its
 * current period is the one shown. `end` is the end of the current period.
 */
export function agreementStatus(s: Pick<Site, "contractEnd" | "renewal" | "noticeDays">, today: string): { status: AgreementStatus; end: string; daysLeft: number | null; noticeFrom: string } {
  if (!s.contractEnd) return { status: "sin-fecha", end: "", daysLeft: null, noticeFrom: "" }
  let end = s.contractEnd
  let rolled = false
  if (s.renewal === "automatica") while (end < today) {
    end = plusYears(end, 1)
    rolled = true
  }
  const notice = s.noticeDays ?? DEFAULT_NOTICE_DAYS
  const noticeFrom = (() => {
    const x = new Date(`${end}T12:00:00Z`)
    x.setUTCDate(x.getUTCDate() - notice)
    return x.toISOString().slice(0, 10)
  })()
  const daysLeft = daysBetween(today, end)
  const status: AgreementStatus = end < today ? "vencido" : today >= noticeFrom ? "por-vencer" : rolled ? "renovado" : "vigente"
  return { status, end, daysLeft, noticeFrom }
}
