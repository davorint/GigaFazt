/**
 * What kind of fiber or cable a "Fibra y cable" item is (owner, 2026-11-19, Compras de materiales: "drop down menus with the
 * type of fiber, mono mode, multimode, exterior, interior, drop cable…"). Every field is optional ("" = not said); the
 * menus hold the usual industry kinds, the owner picks what each product is.
 */

/** Single-mode or multimode. */
export const FIBER_MODES = ["sm", "mm"] as const
/** ITU-T single-mode (G.65x) and ISO/IEC multimode (OMx) fiber grades. */
export const FIBER_GRADES = ["g652d", "g657a1", "g657a2", "g657b3", "g655", "om1", "om2", "om3", "om4", "om5"] as const
export const SM_GRADES: readonly FiberGrade[] = ["g652d", "g657a1", "g657a2", "g657b3", "g655"]
/** The cable it comes in. */
export const CABLE_TYPES = [
  "drop-plano",
  "drop-redondo",
  "drop-autosoportado",
  "adss",
  "mini-adss",
  "asu",
  "figura-8",
  "ducto",
  "armado",
  "enterrado",
  "microcable",
  "distribucion",
  "breakout",
  "riser",
] as const
/** Where it may go. */
export const FIBER_PLACES = ["exterior", "interior", "mixto"] as const
/** How the fibers sit inside. */
export const FIBER_BUILDS = ["tubo-holgado", "tubo-central", "ajustado", "cinta"] as const
/** Jacket material or fire rating. */
export const FIBER_JACKETS = ["lszh", "pvc", "pe", "ofnr", "ofnp"] as const
/** What carries the pull or the span. */
export const FIBER_STRENGTH = ["frp", "acero", "aramida", "mensajero", "ninguno"] as const
/** A connector put on at the factory (pre-connectorized drops and assemblies); "" = bare cable. */
export const FIBER_CONNECTORS = ["sc-apc", "sc-upc", "lc-apc", "lc-upc"] as const
/** Usual strand counts. */
export const STRAND_COUNTS = [1, 2, 4, 6, 8, 12, 24, 36, 48, 72, 96, 144, 288] as const

export type FiberMode = (typeof FIBER_MODES)[number]
export type FiberGrade = (typeof FIBER_GRADES)[number]
export type CableType = (typeof CABLE_TYPES)[number]
export type FiberPlace = (typeof FIBER_PLACES)[number]
export type FiberBuild = (typeof FIBER_BUILDS)[number]
export type FiberJacket = (typeof FIBER_JACKETS)[number]
export type FiberStrength = (typeof FIBER_STRENGTH)[number]
export type FiberConnector = (typeof FIBER_CONNECTORS)[number]

export type FiberSpec = {
  mode: FiberMode | ""
  grade: FiberGrade | ""
  cable: CableType | ""
  place: FiberPlace | ""
  /** Number of fibers in the cable; null = not said. */
  strands: number | null
  build: FiberBuild | ""
  jacket: FiberJacket | ""
  strength: FiberStrength | ""
  /** Aerial cables: the longest span between poles it's rated for, in meters; null = not said. */
  span: number | null
  /** Outer diameter in mm (aerial hardware is sold by it); null = not said. */
  diameter: number | null
  /** Pre-connectorized: the factory connector on its ends ("" = none). */
  connector: FiberConnector | ""
}

export const emptyFiber = (): FiberSpec => ({ mode: "", grade: "", cable: "", place: "", strands: null, build: "", jacket: "", strength: "", span: null, diameter: null, connector: "" })

/** The grade's mode: G.65x is single-mode, OMx multimode. */
export const gradeMode = (g: FiberGrade): FiberMode => (SM_GRADES.includes(g) ? "sm" : "mm")

/** Grades offered for a mode (all when the mode isn't set). */
export const gradesFor = (mode: FiberMode | ""): readonly FiberGrade[] => (mode ? FIBER_GRADES.filter((g) => gradeMode(g) === mode) : FIBER_GRADES)

/** Picking a grade sets its mode; picking a mode clears a grade of the other mode. */
export function setFiber(f: FiberSpec, p: Partial<FiberSpec>): FiberSpec {
  const next = { ...f, ...p }
  if (p.grade) next.mode = gradeMode(p.grade)
  else if (p.mode !== undefined && next.grade && p.mode && gradeMode(next.grade) !== p.mode) next.grade = ""
  return next
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | "" => ((list as readonly unknown[]).includes(v) ? (v as T) : "")

const num = (v: unknown, min: number, max: number, decimals: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10 ** decimals) / 10 ** decimals : null

export function decodeFiber(v: unknown): FiberSpec {
  if (!v || typeof v !== "object" || Array.isArray(v)) return emptyFiber()
  const o = v as Record<string, unknown>
  const grade = pick(FIBER_GRADES, o.grade)
  return {
    mode: grade ? gradeMode(grade) : pick(FIBER_MODES, o.mode),
    grade,
    cable: pick(CABLE_TYPES, o.cable),
    place: pick(FIBER_PLACES, o.place),
    strands: typeof o.strands === "number" && Number.isInteger(o.strands) && o.strands >= 1 && o.strands <= 1728 ? o.strands : null,
    build: pick(FIBER_BUILDS, o.build),
    jacket: pick(FIBER_JACKETS, o.jacket),
    strength: pick(FIBER_STRENGTH, o.strength),
    span: num(o.span, 1, 2000, 0),
    diameter: num(o.diameter, 0.5, 60, 1),
    connector: pick(FIBER_CONNECTORS, o.connector),
  }
}

export const hasFiber = (f: FiberSpec) => Object.values(f).some((x) => x !== "" && x !== null)
