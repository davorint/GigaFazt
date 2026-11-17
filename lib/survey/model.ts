/**
 * Site surveys of a building before a deployment (/interno/levantamientos, owner 2026-11-17): who to talk to and what
 * the building approved, the commercial side (apartments, providers already there, what the building charges), the
 * telecom room the building already has, each tower with its service duct and its floors (per floor, not per
 * apartment), routes through common areas and between towers, common-area Wi-Fi, the carriers that reach the address
 * and what's pending. No photos (owner's choice).
 *
 * Saved in the browser for now (survey-store.ts) and shared as a file; the shape is versioned and every list item
 * has its own id, so each part maps to a Postgres table later (surveys, contacts, providers, towers, floors, routes,
 * areas, carriers, pending) without losing anything. `decodeSurvey` reads any stored or imported value field by field
 * and never throws: unknown fields are dropped, wrong types fall back to the default.
 *
 * Sources for what a survey covers: MDU survey templates (SafetyCulture), carrier site-readiness guides (Verizon,
 * Ziply: power, grounding, pathways, telecom room), the FOA FTTH MDU guide (don't assume 100 % take rate; existing
 * providers), and the CDMX condominium law (the internal rules and the assembly decide on common areas).
 */

export const SURVEY_VERSION = 1

/** Yes / no / not known yet. */
export type Tri = "si" | "no" | ""
export type Approval = "si" | "no" | "pendiente" | ""
export type ContactRole = "administrador" | "comite" | "mantenimiento" | "otro"
export type ProviderTech = "fibra" | "coaxial" | "cobre" | "inalambrico" | ""
export type ConduitState = "si" | "algunos" | "no" | "obstruido" | ""
export type DuctSpace = "amplio" | "justo" | "lleno" | ""
export type RouteKind = "ducto" | "charola" | "muro" | "plafon" | "subterraneo" | "aereo" | "otro"
export type AreaKind = "lobby" | "gimnasio" | "alberca" | "roofgarden" | "salon" | "coworking" | "estacionamiento" | "otro"
export type PowerPayer = "nosotros" | "edificio" | "pendiente" | ""
export type CarrierIp = "publica" | "nat" | ""

export type Contact = { id: string; role: ContactRole; name: string; phone: string; email: string; notes: string }
export type Provider = { id: string; name: string; tech: ProviderTech; notes: string }
export type Floor = {
  /** Floor number: 0 = ground floor, negative = below ground. */
  level: number
  units: number | null
  /** Meters from the service duct to the farthest apartment door on this floor. */
  farthestM: number | null
  conduit: ConduitState
  /** Where a splitter box can go on this floor. */
  boxSpot: string
  notes: string
}
export type Tower = {
  id: string
  name: string
  floorsAbove: number | null
  floorsBelow: number | null
  floorHeightM: number | null
  ductType: string
  ductSpace: DuctSpace
  ductOthers: string
  firestop: Tri
  floors: Floor[]
  notes: string
}
export type Route = { id: string; from: string; to: string; kind: RouteKind; meters: number | null; obstacles: string }
export type Area = { id: string; kind: AreaKind; name: string; wifi: Tri; m2: number | null; walls: string; power: Tri; route: string; notes: string }
export type Carrier = { id: string; name: string; available: Tri; mbps: number | null; leadDays: number | null; ip: CarrierIp; entry: string; notes: string }
export type Pending = { id: string; text: string; who: "edificio" | "nosotros"; done: boolean }

export type Survey = {
  id: string
  v: number
  createdAt: string
  updatedAt: string
  status: "draft" | "done"
  ident: { name: string; address: string; municipality: string; lat: number | null; lng: number | null; visitDate: string; surveyors: string }
  contacts: Contact[]
  permits: { assembly: Approval; assemblyDate: string; agreement: Approval; agreementDate: string; workHours: string; accessRules: string; rules: string }
  commercial: {
    units: number | null
    occupied: number | null
    expectedClients: number | null
    providers: Provider[]
    rentMonthly: number | null
    powerMonthly: number | null
    deposit: number | null
    exclusivity: Approval
    powerPaidBy: PowerPayer
    notes: string
  }
  room: {
    location: string
    sharedWith: string
    rackU: number | null
    outlets: number | null
    dedicatedBreaker: Tri
    amps: number | null
    ground: Tri
    ventilation: Tri
    access: string
    carrierEntry: string
    toDuctM: number | null
    notes: string
  }
  towers: Tower[]
  routes: Route[]
  areas: Area[]
  carriers: Carrier[]
  pending: Pending[]
}

export const SECTIONS = ["ident", "contacts", "commercial", "room", "towers", "routes", "areas", "carriers", "pending"] as const
export type Section = (typeof SECTIONS)[number]

/** Most floors a tower can have above or below ground in the form. */
export const MAX_FLOORS_ABOVE = 80
export const MAX_FLOORS_BELOW = 10
export const MAX_ITEMS = 50

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const today = () => new Date().toISOString().slice(0, 10)

export function emptyTower(name: string): Tower {
  return { id: newId(), name, floorsAbove: null, floorsBelow: 0, floorHeightM: null, ductType: "", ductSpace: "", ductOthers: "", firestop: "", floors: [], notes: "" }
}

export function newSurvey(firstTower = "Torre A", now = new Date().toISOString()): Survey {
  return {
    id: newId(),
    v: SURVEY_VERSION,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    ident: { name: "", address: "", municipality: "", lat: null, lng: null, visitDate: today(), surveyors: "" },
    contacts: [],
    permits: { assembly: "", assemblyDate: "", agreement: "", agreementDate: "", workHours: "", accessRules: "", rules: "" },
    commercial: { units: null, occupied: null, expectedClients: null, providers: [], rentMonthly: null, powerMonthly: null, deposit: null, exclusivity: "", powerPaidBy: "", notes: "" },
    room: { location: "", sharedWith: "", rackU: null, outlets: null, dedicatedBreaker: "", amps: null, ground: "", ventilation: "", access: "", carrierEntry: "", toDuctM: null, notes: "" },
    towers: [emptyTower(firstTower)],
    routes: [],
    areas: [],
    carriers: [],
    pending: [],
  }
}

/**
 * The tower's floors for its counts: from the lowest basement up to the top floor (0 = ground floor). Floors already
 * filled keep their data; floors outside the new range are dropped.
 */
export function syncFloors(t: Tower): Tower {
  const above = Math.min(Math.max(0, Math.floor(t.floorsAbove ?? 0)), MAX_FLOORS_ABOVE)
  const below = Math.min(Math.max(0, Math.floor(t.floorsBelow ?? 0)), MAX_FLOORS_BELOW)
  if (!t.floorsAbove) return { ...t, floors: [] }
  const byLevel = new Map(t.floors.map((f) => [f.level, f]))
  const floors: Floor[] = []
  // Ground floor (0) plus the floors above it: "floorsAbove" counts the ground floor as floor 1 of the building.
  for (let level = 0 - below; level < above; level++) floors.push(byLevel.get(level) ?? { level, units: null, farthestM: null, conduit: "", boxSpot: "", notes: "" })
  return { ...t, floors }
}

/** Copies one floor's apartments, distance and conduit to every other floor that has none yet (fast fill on a phone). */
export function fillFloors(t: Tower, from: Floor, onlyEmpty = true): Tower {
  return {
    ...t,
    floors: t.floors.map((f) =>
      f.level === from.level || (onlyEmpty && (f.units !== null || f.farthestM !== null)) ? f : { ...f, units: from.units, farthestM: from.farthestM, conduit: from.conduit }
    ),
  }
}

/** Apartments counted on a tower's floors. */
export const towerUnits = (t: Tower) => t.floors.reduce((s, f) => s + (f.units ?? 0), 0)

// ── Completeness ────────────────────────────────────────────────────────────

/** How much of a section is filled: done / total key fields (what you need before leaving the building). */
export function completeness(s: Survey, section: Section): { done: number; total: number } {
  const has = (v: unknown) => (typeof v === "number" ? Number.isFinite(v) : typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined)
  const count = (xs: unknown[]) => ({ done: xs.filter(has).length, total: xs.length })
  switch (section) {
    case "ident":
      return count([s.ident.name, s.ident.address, s.ident.municipality, s.ident.lat, s.ident.visitDate, s.ident.surveyors])
    case "contacts":
      return count([
        s.contacts.find((c) => c.role === "administrador" && (c.phone || c.email))?.name,
        s.permits.assembly,
        s.permits.agreement,
        s.permits.workHours,
        s.permits.accessRules,
      ])
    case "commercial":
      return count([s.commercial.units, s.commercial.occupied, s.commercial.expectedClients, s.commercial.providers.length ? "x" : "", s.commercial.exclusivity, s.commercial.powerPaidBy])
    case "room":
      return count([s.room.location, s.room.rackU, s.room.outlets, s.room.dedicatedBreaker, s.room.ground, s.room.ventilation, s.room.access, s.room.carrierEntry, s.room.toDuctM])
    case "towers": {
      if (!s.towers.length) return { done: 0, total: 1 }
      let done = 0
      let total = 0
      for (const t of s.towers) {
        const c = count([t.floorsAbove, t.floorHeightM, t.ductType, t.ductSpace, t.firestop])
        done += c.done
        total += c.total
        done += t.floors.filter((f) => f.units !== null && f.farthestM !== null && f.conduit).length
        total += Math.max(1, t.floors.length)
      }
      return { done, total }
    }
    case "routes":
      return { done: s.routes.filter((r) => r.meters !== null && r.from && r.to).length, total: Math.max(1, s.routes.length) }
    case "areas":
      return { done: s.areas.filter((a) => a.wifi !== "").length, total: Math.max(1, s.areas.length) }
    case "carriers":
      return { done: s.carriers.filter((c) => c.available !== "" && c.mbps !== null && c.leadDays !== null).length, total: Math.max(1, s.carriers.length) }
    case "pending":
      return { done: s.pending.filter((p) => p.done).length, total: s.pending.length }
  }
}

// ── Reading stored or imported values ───────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "")
const num = (v: unknown, min = -1e9, max = 1e9) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null)
const one = <T extends string>(v: unknown, of: readonly T[], fallback: T): T => (typeof v === "string" && (of as readonly string[]).includes(v) ? (v as T) : fallback)
const bool = (v: unknown) => v === true
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : newId())
const list = <T>(v: unknown, read: (x: Obj) => T): T[] => (Array.isArray(v) ? v.filter(isObj).slice(0, MAX_ITEMS).map(read) : [])
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 30) : "")

const TRI = ["si", "no", ""] as const
const APPROVAL = ["si", "no", "pendiente", ""] as const

function readFloor(x: Obj): Floor {
  return {
    level: Math.round(num(x.level, -MAX_FLOORS_BELOW, MAX_FLOORS_ABOVE) ?? 0),
    units: num(x.units, 0, 200),
    farthestM: num(x.farthestM, 0, 1000),
    conduit: one(x.conduit, ["si", "algunos", "no", "obstruido", ""] as const, ""),
    boxSpot: str(x.boxSpot, 300),
    notes: str(x.notes, 1000),
  }
}

function readTower(x: Obj): Tower {
  const floors = Array.isArray(x.floors) ? x.floors.filter(isObj).slice(0, MAX_FLOORS_ABOVE + MAX_FLOORS_BELOW).map(readFloor) : []
  return {
    id: id(x.id),
    name: str(x.name, 100),
    floorsAbove: num(x.floorsAbove, 0, MAX_FLOORS_ABOVE),
    floorsBelow: num(x.floorsBelow, 0, MAX_FLOORS_BELOW),
    floorHeightM: num(x.floorHeightM, 0, 20),
    ductType: str(x.ductType, 300),
    ductSpace: one(x.ductSpace, ["amplio", "justo", "lleno", ""] as const, ""),
    ductOthers: str(x.ductOthers, 500),
    firestop: one(x.firestop, TRI, ""),
    // One entry per level, in order.
    floors: [...new Map(floors.map((f) => [f.level, f])).values()].sort((a, b) => a.level - b.level),
    notes: str(x.notes, 2000),
  }
}

/** Any stored or imported value as a survey, or null when it isn't one (no id or no ident). */
export function decodeSurvey(v: unknown): Survey | null {
  if (!isObj(v) || typeof v.id !== "string" || !isObj(v.ident)) return null
  const d = newSurvey()
  const i = v.ident
  const p = isObj(v.permits) ? v.permits : {}
  const c = isObj(v.commercial) ? v.commercial : {}
  const r = isObj(v.room) ? v.room : {}
  return {
    id: id(v.id),
    v: SURVEY_VERSION,
    createdAt: date(v.createdAt) || d.createdAt,
    updatedAt: date(v.updatedAt) || d.updatedAt,
    status: one(v.status, ["draft", "done"] as const, "draft"),
    ident: {
      name: str(i.name, 200),
      address: str(i.address, 500),
      municipality: str(i.municipality, 200),
      lat: num(i.lat, -90, 90),
      lng: num(i.lng, -180, 180),
      visitDate: date(i.visitDate).slice(0, 10),
      surveyors: str(i.surveyors, 300),
    },
    contacts: list(v.contacts, (x) => ({
      id: id(x.id),
      role: one(x.role, ["administrador", "comite", "mantenimiento", "otro"] as const, "otro"),
      name: str(x.name, 200),
      phone: str(x.phone, 50),
      email: str(x.email, 200),
      notes: str(x.notes, 1000),
    })),
    permits: {
      assembly: one(p.assembly, APPROVAL, ""),
      assemblyDate: date(p.assemblyDate).slice(0, 10),
      agreement: one(p.agreement, APPROVAL, ""),
      agreementDate: date(p.agreementDate).slice(0, 10),
      workHours: str(p.workHours, 500),
      accessRules: str(p.accessRules, 1000),
      rules: str(p.rules, 2000),
    },
    commercial: {
      units: num(c.units, 0, 10000),
      occupied: num(c.occupied, 0, 10000),
      expectedClients: num(c.expectedClients, 0, 10000),
      providers: list(c.providers, (x) => ({ id: id(x.id), name: str(x.name, 100), tech: one(x.tech, ["fibra", "coaxial", "cobre", "inalambrico", ""] as const, ""), notes: str(x.notes, 500) })),
      rentMonthly: num(c.rentMonthly, 0, 1e7),
      powerMonthly: num(c.powerMonthly, 0, 1e7),
      deposit: num(c.deposit, 0, 1e7),
      exclusivity: one(c.exclusivity, APPROVAL, ""),
      powerPaidBy: one(c.powerPaidBy, ["nosotros", "edificio", "pendiente", ""] as const, ""),
      notes: str(c.notes, 2000),
    },
    room: {
      location: str(r.location, 300),
      sharedWith: str(r.sharedWith, 300),
      rackU: num(r.rackU, 0, 100),
      outlets: num(r.outlets, 0, 100),
      dedicatedBreaker: one(r.dedicatedBreaker, TRI, ""),
      amps: num(r.amps, 0, 1000),
      ground: one(r.ground, TRI, ""),
      ventilation: one(r.ventilation, TRI, ""),
      access: str(r.access, 500),
      carrierEntry: str(r.carrierEntry, 500),
      toDuctM: num(r.toDuctM, 0, 5000),
      notes: str(r.notes, 2000),
    },
    towers: list(v.towers, readTower),
    routes: list(v.routes, (x) => ({
      id: id(x.id),
      from: str(x.from, 200),
      to: str(x.to, 200),
      kind: one(x.kind, ["ducto", "charola", "muro", "plafon", "subterraneo", "aereo", "otro"] as const, "otro"),
      meters: num(x.meters, 0, 10000),
      obstacles: str(x.obstacles, 1000),
    })),
    areas: list(v.areas, (x) => ({
      id: id(x.id),
      kind: one(x.kind, ["lobby", "gimnasio", "alberca", "roofgarden", "salon", "coworking", "estacionamiento", "otro"] as const, "otro"),
      name: str(x.name, 200),
      wifi: one(x.wifi, TRI, ""),
      m2: num(x.m2, 0, 100000),
      walls: str(x.walls, 300),
      power: one(x.power, TRI, ""),
      route: str(x.route, 500),
      notes: str(x.notes, 1000),
    })),
    carriers: list(v.carriers, (x) => ({
      id: id(x.id),
      name: str(x.name, 100),
      available: one(x.available, TRI, ""),
      mbps: num(x.mbps, 0, 1e6),
      leadDays: num(x.leadDays, 0, 3650),
      ip: one(x.ip, ["publica", "nat", ""] as const, ""),
      entry: str(x.entry, 300),
      notes: str(x.notes, 1000),
    })),
    pending: list(v.pending, (x) => ({ id: id(x.id), text: str(x.text, 500), who: one(x.who, ["edificio", "nosotros"] as const, "edificio"), done: bool(x.done) })),
  }
}

// ── File to share between phones ────────────────────────────────────────────

export const SURVEY_FILE = "gigafazt-levantamientos"

export function surveyFile(surveys: Survey[]): string {
  return JSON.stringify({ type: SURVEY_FILE, v: SURVEY_VERSION, exportedAt: new Date().toISOString(), surveys }, null, 2)
}

/** The surveys in an exported file; null when the text isn't one of our files. */
export function readSurveyFile(text: string): Survey[] | null {
  try {
    const v = JSON.parse(text) as unknown
    if (!isObj(v) || v.type !== SURVEY_FILE || !Array.isArray(v.surveys)) return null
    return v.surveys.map(decodeSurvey).filter((s): s is Survey => s !== null)
  } catch {
    return null
  }
}

/**
 * Imported surveys into the saved list: a new id is added; the same id is replaced only when the imported copy is
 * as new or newer (so an old file never undoes newer work). Returns the merged list and what happened.
 */
export function mergeSurveys(saved: Survey[], incoming: Survey[]): { list: Survey[]; added: number; replaced: number; kept: number } {
  const out = [...saved]
  let added = 0
  let replaced = 0
  let kept = 0
  for (const s of incoming) {
    const k = out.findIndex((x) => x.id === s.id)
    if (k < 0) {
      out.push(s)
      added++
    } else if (s.updatedAt >= out[k].updatedAt) {
      out[k] = s
      replaced++
    } else kept++
  }
  return { list: out, added, replaced, kept }
}
