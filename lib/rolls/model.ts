/**
 * Fiber rolls (/interno/materiales/en-existencia?t=bobinas, owner 2026-11-18: "specify the number of fiber rolls, the length
 * of the rolls, the type of fiber, how much fiber is left, all easy to input with drop menus").
 *
 * One record per physical roll: the cable (drop, interior, ADSS…), its strands, single mode or multimode and the fiber
 * standard (G.657A2, OM3…), indoor or outdoor, the jacket, loose or tight buffer, factory connectors, the length it came
 * with, the meters left, and where it is (the warehouse or a deployment). Several identical rolls are added at once
 * (a count), each with its own number ("B-12") to write on the reel. Meters left are picked from a menu (full, 90 %…
 * empty) or by what was used ("Usé 50 m"), so nobody has to type.
 *
 * Synced like the other sections (kind "rolls", table `rolls`). `decodeRoll` never throws.
 */
import { newId } from "../survey/id"
import { BODEGA } from "../stock/model"

/** The cable's construction (what it's for). */
export const CABLES = ["drop-plano", "drop-redondo", "drop-autosoportado", "interior", "distribucion", "breakout", "simplex-duplex", "adss", "figura-8", "armado", "canalizado", "microcable", "otro"] as const
export type Cable = (typeof CABLES)[number]
export const STRANDS = [1, 2, 4, 6, 8, 12, 16, 24, 36, 48, 72, 96, 144, 288] as const
/** Single mode (sm) or multimode (mm). */
export const MODES = ["sm", "mm"] as const
export type Mode = (typeof MODES)[number]
/** The fiber standard: ITU G.65x for single mode, OM1–OM5 for multimode. */
export const FIBERS = ["g657a2", "g657a1", "g652d", "g655", "g654e", "om1", "om2", "om3", "om4", "om5", "otra"] as const
export type Fiber = (typeof FIBERS)[number]
const MM_FIBERS: Fiber[] = ["om1", "om2", "om3", "om4", "om5"]
/** The standards of a mode ("otra" in both). */
export const fibersFor = (mode: Mode): Fiber[] => FIBERS.filter((f) => f === "otra" || (mode === "mm") === MM_FIBERS.includes(f))
export const modeOf = (f: Fiber): Mode | null => (f === "otra" ? null : MM_FIBERS.includes(f) ? "mm" : "sm")
/** Where it can be installed. */
export const ENVS = ["exterior", "interior", "int-ext"] as const
export type Env = (typeof ENVS)[number]
/** The outer jacket ("" = not given). */
export const JACKETS = ["", "lszh", "pvc", "pe", "ofnr", "ofnp", "otra"] as const
export type Jacket = (typeof JACKETS)[number]
/** How the fibers are held inside ("" = not given). */
export const BUFFERS = ["", "holgado", "ajustado", "ribbon", "otro"] as const
export type Buffer = (typeof BUFFERS)[number]
/** Factory connectors on the ends (pre-terminated drop and jumpers). */
export const ENDS = ["ninguno", "sc-apc-1", "sc-apc-2", "sc-upc-2", "lc-upc-2", "otro"] as const
export type Ends = (typeof ENDS)[number]

/** Brands the team prefers, first in the brand menu (owner, 2026-11-18: "one of the fiber brands we like is fiberhome"). */
export const PREFERRED_BRANDS = ["FiberHome"]

/** The brand menu: the preferred ones, then every other brand already used (once, ignoring case), A–Z. */
export function brandOptions(rolls: Pick<Roll, "brand">[]): string[] {
  // The first spelling seen wins ("Icoptiks" before a later "icoptiks").
  const seen = new Set(PREFERRED_BRANDS.map((x) => x.toLowerCase()))
  const used: string[] = []
  for (const r of rolls) {
    const name = r.brand.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    used.push(name)
  }
  return [...PREFERRED_BRANDS, ...used.sort((x, y) => x.localeCompare(y, "es"))]
}

/** What a kind of cable usually is, to fill the menus when it's picked. */
export function cableDefaults(c: Cable): { env: Env; mode: Mode; fiber: Fiber } {
  if (c === "drop-plano" || c === "drop-redondo" || c === "drop-autosoportado") return { env: "exterior", mode: "sm", fiber: "g657a2" }
  if (c === "interior" || c === "distribucion" || c === "breakout" || c === "simplex-duplex") return { env: "interior", mode: "sm", fiber: "g657a1" }
  return { env: "exterior", mode: "sm", fiber: "g652d" }
}
/** Usual reel lengths, in meters (any other can be typed). */
export const LENGTHS = [100, 150, 200, 300, 500, 1000, 2000, 3000, 4000, 5000] as const
/** The "Usé…" menu, in meters. */
export const USED_STEPS = [5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 500] as const
/** At most this many rolls in one add. */
export const MAX_COUNT = 50
export const MAX_LENGTH = 20000

export type Roll = {
  id: string
  /** The number written on the reel ("B-12"). */
  code: string
  cable: Cable
  strands: number
  mode: Mode
  fiber: Fiber
  env: Env
  jacket: Jacket
  buffer: Buffer
  ends: Ends
  /** Optional: the maker or line (LinkedPro, Icoptiks…). */
  brand: string
  lengthM: number
  leftM: number
  /** The warehouse ("bodega") or a deployment ("s:<id>"). */
  place: string
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

export function newRoll(p: Partial<Roll> = {}): Roll {
  const lengthM = p.lengthM ?? 1000
  return { id: newId(), code: "", cable: "drop-plano", strands: 1, mode: "sm", fiber: "g657a2", env: "exterior", jacket: "", buffer: "", ends: "ninguno", brand: "", lengthM, leftM: lengthM, place: BODEGA, notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

/** What makes rolls "the same kind of cable". */
export type RollSpec = "cable" | "strands" | "mode" | "fiber" | "env" | "jacket" | "buffer" | "ends" | "brand"

/** The next free reel number: one more than the highest "B-<n>". */
export function nextCode(rolls: Pick<Roll, "code">[]): number {
  let max = 0
  for (const r of rolls) {
    const m = /^B-(\d{1,6})$/.exec(r.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** `count` identical rolls, numbered from the next free number. */
export function addRolls(existing: Pick<Roll, "code">[], spec: Pick<Roll, RollSpec | "lengthM" | "place"> & { by: string }, count: number): Roll[] {
  const n = Math.max(1, Math.min(MAX_COUNT, Math.floor(count)))
  const from = nextCode(existing)
  return Array.from({ length: n }, (_, i) => newRoll({ ...spec, leftM: spec.lengthM, code: `B-${from + i}` }))
}

export type RollState = "llena" | "en-uso" | "vacia"
export const rollState = (r: Pick<Roll, "lengthM" | "leftM">): RollState => (r.leftM <= 0 ? "vacia" : r.leftM >= r.lengthM ? "llena" : "en-uso")
export const percentLeft = (r: Pick<Roll, "lengthM" | "leftM">) => (r.lengthM > 0 ? Math.round((r.leftM / r.lengthM) * 100) : 0)

/** Meters left after using some (never below 0). */
export const spendMeters = (r: Roll, used: number): Roll => ({ ...r, leftM: Math.max(0, Math.round((r.leftM - used) * 10) / 10) })

/** The "Quedan" menu: full, 90 %, 80 %… empty, in meters of this roll (and the current value when it's in between). */
export function leftOptions(r: Pick<Roll, "lengthM" | "leftM">): number[] {
  const set = new Set<number>()
  for (let p = 100; p >= 0; p -= 10) set.add(Math.round((r.lengthM * p) / 100))
  set.add(r.leftM)
  return [...set].sort((a, b) => b - a)
}

/** The same kind of cable: cable, strands and fiber. */
export const rollKind = (r: Pick<Roll, "cable" | "strands" | "mode" | "fiber" | "env">) => `${r.cable}|${r.strands}|${r.mode}|${r.fiber}|${r.env}`

export type RollGroup = { key: string; cable: Cable; strands: number; mode: Mode; fiber: Fiber; env: Env; rolls: number; full: number; empty: number; leftM: number }

/** Totals per kind of cable (construction, strands, mode, standard, indoor/outdoor): rolls (not counting empty ones), full ones, empty ones, meters left. Most meters first. */
export function rollTotals(rolls: Roll[]): RollGroup[] {
  const map = new Map<string, RollGroup>()
  for (const r of rolls) {
    const key = rollKind(r)
    const g = map.get(key) ?? { key, cable: r.cable, strands: r.strands, mode: r.mode, fiber: r.fiber, env: r.env, rolls: 0, full: 0, empty: 0, leftM: 0 }
    const s = rollState(r)
    if (s === "vacia") g.empty++
    else g.rolls++
    if (s === "llena") g.full++
    g.leftM += r.leftM
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => b.leftM - a.leftM)
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const iso = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v.slice(0, 40) : "")
const ID = /^[\w-]{6,64}$/
const meters = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_LENGTH ? Math.round(v * 10) / 10 : null)

export function decodeRoll(v: unknown): Roll | null {
  if (!isObj(v)) return null
  const lengthM = meters(v.lengthM) || 1000
  const left = meters(v.leftM)
  const cable = (CABLES as readonly unknown[]).includes(v.cable) ? (v.cable as Cable) : "otro"
  const fiber = (FIBERS as readonly unknown[]).includes(v.fiber) ? (v.fiber as Fiber) : "otra"
  // Rolls saved before the mode existed take it from their standard; a standard of the other mode becomes "otra".
  const mode: Mode = (MODES as readonly unknown[]).includes(v.mode) ? (v.mode as Mode) : (modeOf(fiber) ?? "sm")
  const pick = <T extends string>(list: readonly T[], x: unknown, fallback: T) => ((list as readonly unknown[]).includes(x) ? (x as T) : fallback)
  const place = typeof v.place === "string" && (v.place === BODEGA || /^s:[\w-]{6,64}$/.test(v.place)) ? v.place : BODEGA
  return {
    id: typeof v.id === "string" && ID.test(v.id) ? v.id : newId(),
    code: str(v.code, 20),
    cable,
    strands: (STRANDS as readonly unknown[]).includes(v.strands) ? (v.strands as number) : 1,
    mode,
    fiber: fibersFor(mode).includes(fiber) ? fiber : "otra",
    env: pick(ENVS, v.env, cableDefaults(cable).env),
    jacket: pick(JACKETS, v.jacket, ""),
    buffer: pick(BUFFERS, v.buffer, ""),
    ends: pick(ENDS, v.ends, "ninguno"),
    brand: str(v.brand, 80),
    lengthM,
    leftM: left === null ? lengthM : Math.min(left, lengthM),
    place,
    notes: str(v.notes, 1000),
    by: str(v.by, 40),
    createdAt: iso(v.createdAt) || new Date().toISOString(),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
