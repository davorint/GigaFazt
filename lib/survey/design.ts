/**
 * The fiber design of each tower in a site survey and the light that reaches every floor (owner, 2026-11-17).
 *
 * The owner's usual layout: a fiber from a GPON port to the base of the service duct, a balanced splitter there, one
 * fiber per floor or pair of floors up the duct, and a balanced splitter on the floor whose ports serve the apartments
 * when they sign up; usually 1 or 2 fibers (feeds) per tower. Sometimes unbalanced taps along a riser fiber instead
 * (the small side feeds a floor splitter, the large side keeps going), so a tower can be balanced, unbalanced or mixed.
 * There is no cap on clients per port: only the light decides.
 *
 * Model: tower → feeds (fibers from the OLT) → each feed's base splitter (or none) → branches (one per base output) →
 * stops along the branch, in order from the base. A stop sits on a floor and has an optional tap and an optional floor
 * splitter that serves that floor and the next ones up.
 *
 * Losses: balanced PLC splitters from /interno/olt (lib/olt-kb SPLITTERS, a reseller table); unbalanced FBT taps from
 * the Bazis Telecom datasheet (P grade, maximum: 5/95 14.2/0.4, 10/90 11.0/0.65, 20/80 7.6/1.2, 30/70 5.7/1.9, 50/50
 * 3.4 dB) and Agiltron's (40/60 4.7/2.7), editable; fiber, connectors and splices are the same planning values as the
 * /olt calculator. The module classes and the ONT's sensitivity come from lib/olt-kb.
 */
import { BUDGETS, ONT_SENSITIVITY, SPLITTERS } from "../olt-kb"
import { newId } from "./id"
import type { Floor, Survey, Tower } from "./model"

export const SPLIT_RATIOS = SPLITTERS.map((s) => s.ratio)
/** Taps by the % that goes to the small (drop) side. */
export const TAP_RATIOS = [5, 10, 20, 30, 40, 50] as const
export type TapRatio = (typeof TAP_RATIOS)[number]
export type TapLoss = { pct: TapRatio; small: number; large: number }
export const DEFAULT_TAPS: TapLoss[] = [
  { pct: 5, small: 14.2, large: 0.4 },
  { pct: 10, small: 11.0, large: 0.65 },
  { pct: 20, small: 7.6, large: 1.2 },
  { pct: 30, small: 5.7, large: 1.9 },
  { pct: 40, small: 4.7, large: 2.7 },
  { pct: 50, small: 3.4, large: 3.4 },
]

export type Stop = {
  id: string
  /** Floor where the tap and/or the floor splitter sit. */
  level: number
  /** Unbalanced tap (small-side %), or null: all the remaining light goes to this stop (the end of the branch). */
  tap: TapRatio | null
  /** Floor balanced splitter ratio, or 0 for none (a tap kept for later). */
  split: number
  /** Floors served by the floor splitter, from `level` up (1 = only this floor). */
  serves: number
}
export type Branch = { id: string; stops: Stop[] }
export type Feed = { id: string; name: string; base: number; branches: Branch[] }
export type Design = {
  /** Floor where the base of the service duct (and the base splitters) is. */
  baseLevel: number
  feeds: Feed[]
}

export type Optics = {
  /** OLT module class (lib/olt-kb BUDGETS, GPON). */
  cls: string
  /** Power out of the OLT port, dBm: measured, or the class minimum. */
  txDbm: number
  ontSensitivity: number
  ontOverload: number
  marginDb: number
  connectorDb: number
  spliceDb: number
  /** How fibers join at each splitter or tap: two fusion splices, or two connectors. */
  joint: "splice" | "connector"
  /** Connectors on every path besides the splitters' joints (OLT patch panel, floor box outlet, ONT). */
  fixedConnectors: number
  fiberDbKm: number
  /** Floor height when the tower doesn't say, m. */
  floorHeightM: number
  /** Extra riser fiber for routing and loops, %. */
  slackPct: number
  /** Extra per drop, m. */
  dropSlackM: number
  taps: TapLoss[]
}

/** Minimum transmit power per GPON class (the low end of each published range; C+++/C++++ from lib/olt-kb). */
export const CLASS_TX: Record<string, number> = { "B+": 1.5, "C+": 3, "C++": 6, "C+++": 6, "C++++": 9 }
/** Maximum transmit power per GPON class (the high end of each published range, lib/olt-kb BUDGETS). */
export const CLASS_TX_MAX: Record<string, number> = Object.fromEntries(BUDGETS.filter((b) => b.tech === "gpon" && b.txMax).map((b) => [b.id, b.txMax!.v]))

/**
 * The power to check ONT overload with: a measured port power as it is; the class's minimum (not measured) means the
 * real module can be up to its class maximum, so the overload check uses that (as the /olt calculator does).
 */
export function overloadTx(o: Pick<Optics, "cls" | "txDbm">): number {
  const max = CLASS_TX_MAX[o.cls]
  return o.txDbm === CLASS_TX[o.cls] && max !== undefined ? Math.max(o.txDbm, max) : o.txDbm
}
export const GPON_CLASSES = BUDGETS.filter((b) => b.tech === "gpon").map((b) => b.id)

export const DEFAULT_OPTICS: Optics = {
  cls: "C+",
  txDbm: CLASS_TX["C+"],
  ontSensitivity: ONT_SENSITIVITY.v,
  ontOverload: -8,
  marginDb: 3,
  connectorDb: 0.5,
  spliceDb: 0.1,
  joint: "splice",
  fixedConnectors: 3,
  fiberDbKm: 0.35,
  floorHeightM: 3,
  slackPct: 10,
  dropSlackM: 3,
  taps: DEFAULT_TAPS,
}

export const splitLoss = (ratio: number) => (ratio > 1 ? (SPLITTERS.find((s) => s.ratio === ratio)?.loss.v ?? null) : 0)
const tapOf = (o: Optics, pct: TapRatio) => o.taps.find((t) => t.pct === pct) ?? DEFAULT_TAPS.find((t) => t.pct === pct)!
const round1 = (x: number) => Math.round(x * 10) / 10
/** Power-of-two ratio that covers n ports. */
export const ratioFor = (n: number) => SPLIT_RATIOS.find((r) => r >= n) ?? SPLIT_RATIOS[SPLIT_RATIOS.length - 1]

// ── Templates ───────────────────────────────────────────────────────────────

/** Floors that have apartments (or all floors above the street when none are counted yet), bottom to top. */
export function servedFloors(t: Tower): Floor[] {
  const withUnits = t.floors.filter((f) => (f.units ?? 0) > 0)
  return withUnits.length ? withUnits : t.floors.filter((f) => f.level >= 0)
}

/** Floors in groups of `per` consecutive served floors, bottom to top. */
function groups(t: Tower, per: number): Floor[][] {
  const fs = servedFloors(t)
  const out: Floor[][] = []
  for (let i = 0; i < fs.length; i += per) out.push(fs.slice(i, i + per))
  return out
}
const unitsOf = (fs: Floor[]) => fs.reduce((s, f) => s + (f.units ?? 0), 0)

export type BalancedTemplate = { feeds: number; perBox: number; base: number | "auto"; floor: number | "auto" }
/**
 * The owner's usual layout: each feed's base splitter sends one fiber to each box; a box serves `perBox` floors with
 * a floor splitter. Boxes are split between the feeds in order (feed 1 the lower floors). "auto": the smallest ratios
 * that cover the boxes per feed and the apartments per box.
 */
export function balancedDesign(t: Tower, o: BalancedTemplate): Design {
  const gs = groups(t, Math.max(1, o.perBox))
  const feeds = Math.max(1, Math.min(4, o.feeds))
  const per = Math.ceil(gs.length / feeds) || 1
  // One box per feed needs no base splitter (a 1:2 there would only add ~4 dB).
  const base = o.base === "auto" ? (per <= 1 ? 1 : ratioFor(per)) : o.base
  return {
    baseLevel: baseLevelOf(t),
    feeds: Array.from({ length: feeds }, (_, k) => ({
      id: newId(),
      name: `F${k + 1}`,
      base,
      branches: gs.slice(k * per, (k + 1) * per).map((g) => ({
        id: newId(),
        stops: [{ id: newId(), level: g[0].level, tap: null, split: o.floor === "auto" ? ratioFor(Math.max(2, unitsOf(g))) : o.floor, serves: g[g.length - 1].level - g[0].level + 1 }],
      })),
    })),
  }
}

export type TapTemplate = { feeds: number; perBox: number; floor: number | "auto" }
/**
 * Unbalanced riser: each feed is one fiber up the duct (no base splitter) with a tap and floor splitter every `perBox`
 * floors and a plain floor splitter at the end; taps suggested so every stop gets as much light as possible.
 */
export function tapDesign(t: Tower, o: TapTemplate, optics: Optics): Design {
  const gs = groups(t, Math.max(1, o.perBox))
  const feeds = Math.max(1, Math.min(4, o.feeds))
  const per = Math.ceil(gs.length / feeds) || 1
  const d: Design = {
    baseLevel: baseLevelOf(t),
    feeds: Array.from({ length: feeds }, (_, k) => {
      const mine = gs.slice(k * per, (k + 1) * per)
      return {
        id: newId(),
        name: `F${k + 1}`,
        base: 1,
        branches: mine.length
          ? [
              {
                id: newId(),
                stops: mine.map((g, i) => ({
                  id: newId(),
                  level: g[0].level,
                  tap: i === mine.length - 1 ? null : 10,
                  split: o.floor === "auto" ? ratioFor(Math.max(2, unitsOf(g))) : o.floor,
                  serves: g[g.length - 1].level - g[0].level + 1,
                })),
              },
            ]
          : [],
      }
    }),
  }
  return { ...d, feeds: d.feeds.map((f) => ({ ...f, branches: f.branches.map((b) => suggestTaps(b, f, d, t, optics)) })) }
}

export const baseLevelOf = (t: Tower) => (t.floors.length ? Math.min(0, t.floors[0].level) : 0)

// ── Light per stop ──────────────────────────────────────────────────────────

export type StopResult = {
  feed: string
  branch: number
  stop: Stop
  levels: number[]
  units: number
  ports: number
  /** Loss from the OLT port to the farthest apartment on these floors, dB. */
  lossDb: number
  /** Light at that apartment's ONT, dBm. */
  rxDbm: number
  /** rxDbm − sensitivity − margin. */
  spareDb: number
  status: "ok" | "tight" | "no" | "overload" | "noSplit"
  /** Light left in the riser after this stop's tap (null at the end). */
  throughDbm: number | null
}

const fiberDb = (m: number, o: Optics) => (m / 1000) * o.fiberDbKm
const jointDb = (o: Optics) => 2 * (o.joint === "splice" ? o.spliceDb : o.connectorDb)

/** Meters along the duct from the base to a floor (with the riser slack). */
export function riserM(t: Tower, d: Design, level: number, o: Optics) {
  return Math.abs(level - d.baseLevel) * (t.floorHeightM ?? o.floorHeightM) * (1 + o.slackPct / 100)
}
/** Meters of the longest drop from a floor box serving `serves` floors from `level`. */
function dropM(t: Tower, level: number, serves: number, o: Optics) {
  let worst = 0
  for (let i = 0; i < Math.max(1, serves); i++) {
    const f = t.floors.find((x) => x.level === level + i)
    worst = Math.max(worst, (f?.farthestM ?? 0) + i * (t.floorHeightM ?? o.floorHeightM))
  }
  return worst + o.dropSlackM
}

/** The light at every stop of a tower's design. */
export function designResults(t: Tower, d: Design, s: { room: Pick<Survey["room"], "toDuctM"> }, o: Optics): StopResult[] {
  const out: StopResult[] = []
  const toBase = s.room.toDuctM ?? 0
  for (const f of d.feeds) {
    const base = splitLoss(f.base) ?? 0
    // Fixed losses on every path: connectors, the base splitter and its joints, the fiber to the base.
    const head = o.fixedConnectors * o.connectorDb + base + (f.base > 1 ? jointDb(o) : 0) + fiberDb(toBase, o)
    f.branches.forEach((b, bi) => {
      let riser = head
      let prevM = 0
      b.stops.forEach((st, si) => {
        const m = riserM(t, d, st.level, o)
        riser += fiberDb(Math.max(0, m - prevM), o)
        prevM = m
        const tap = st.tap ? tapOf(o, st.tap) : null
        const toFloor = riser + (tap ? tap.small + jointDb(o) : 0)
        const split = splitLoss(st.split)
        const lossDb = toFloor + (st.split > 1 ? (split ?? 0) + jointDb(o) : 0) + fiberDb(dropM(t, st.level, st.serves, o), o)
        const levels = Array.from({ length: Math.max(1, st.serves) }, (_, i) => st.level + i)
        const units = levels.reduce((sum, l) => sum + (t.floors.find((x) => x.level === l)?.units ?? 0), 0)
        const rxDbm = o.txDbm - lossDb
        const spareDb = rxDbm - o.ontSensitivity - o.marginDb
        // Too little light is judged at the weakest transmitter; too much at the strongest.
        const status: StopResult["status"] = st.split < 2 ? "noSplit" : overloadTx(o) - lossDb > o.ontOverload ? "overload" : spareDb >= 0 ? "ok" : rxDbm >= o.ontSensitivity ? "tight" : "no"
        if (tap) riser += tap.large + jointDb(o)
        const last = si === b.stops.length - 1
        out.push({ feed: f.name, branch: bi + 1, stop: st, levels, units, ports: st.split > 1 ? st.split : 0, lossDb: round1(lossDb), rxDbm: round1(rxDbm), spareDb: round1(spareDb), status, throughDbm: tap && !last ? round1(o.txDbm - riser) : null })
      })
    })
  }
  return out
}

export type DesignSummary = {
  ports: number
  units: number
  /** Floors with apartments that no floor splitter serves. */
  uncovered: number[]
  /** Floor splitters with fewer ports than the apartments they serve. */
  short: number
  /** Feeds whose base splitter has fewer outputs than branches. */
  overBase: string[]
  worst: StopResult | null
  feeds: number
}

export function summarize(t: Tower, d: Design, r: StopResult[]): DesignSummary {
  const covered = new Set(r.filter((x) => x.ports > 0).flatMap((x) => x.levels))
  return {
    ports: r.reduce((s, x) => s + x.ports, 0),
    units: r.reduce((s, x) => s + x.units, 0),
    uncovered: t.floors.filter((f) => (f.units ?? 0) > 0 && !covered.has(f.level)).map((f) => f.level),
    short: r.filter((x) => x.ports > 0 && x.ports < x.units).length,
    overBase: d.feeds.filter((f) => f.branches.length > Math.max(1, f.base)).map((f) => f.name),
    worst: r.filter((x) => x.ports > 0).reduce<StopResult | null>((w, x) => (!w || x.rxDbm < w.rxDbm ? x : w), null),
    feeds: d.feeds.length,
  }
}

// ── Tap suggestion ──────────────────────────────────────────────────────────

/**
 * Taps for one branch so the weakest floor gets as much light as possible: for a target power, each stop takes the
 * smallest tap that still reaches it (leaving the most light for the floors after it) and the last stop takes all
 * that's left; the highest target that works wins. Stops without a tap stay without one only at the end.
 */
export function suggestTaps(b: Branch, f: Feed, d: Design, t: Tower, o: Optics, room: Pick<Survey["room"], "toDuctM"> = { toDuctM: null }): Branch {
  if (b.stops.length < 2) return { ...b, stops: b.stops.map((s) => ({ ...s, tap: null })) }
  const tryTarget = (target: number): Branch | null => {
    const stops: Stop[] = []
    for (let i = 0; i < b.stops.length; i++) {
      const last = i === b.stops.length - 1
      const options: (TapRatio | null)[] = last ? [null] : [...TAP_RATIOS]
      let chosen: Stop | null = null
      for (const tap of options) {
        const trial = { ...b.stops[i], tap }
        // The stops after this one don't change its light: only the ones up to it are needed.
        const res = designResults(t, { ...d, feeds: [{ ...f, branches: [{ ...b, stops: [...stops, trial] }] }] }, { room }, o)
        if ((res[i]?.rxDbm ?? -99) >= target) {
          chosen = trial
          break
        }
      }
      if (!chosen) return null
      stops.push(chosen)
    }
    return { ...b, stops }
  }
  let lo = -40
  let hi = 10
  let best: Branch | null = null
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    const r = tryTarget(mid)
    if (r) {
      best = r
      lo = mid
    } else hi = mid
  }
  return best ?? b
}

/** A stop added at the end of a branch (one floor above the last one). */
export const newStop = (level: number, split = 8): Stop => ({ id: newId(), level, tap: null, split, serves: 1 })

// ── Reading stored or imported values ───────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback)
const okId = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : newId())
const ratio = (v: unknown, fallback: number) => (typeof v === "number" && (v === 0 || v === 1 || SPLIT_RATIOS.includes(v)) ? v : fallback)
const tapPct = (v: unknown): TapRatio | null => ((TAP_RATIOS as readonly unknown[]).includes(v) ? (v as TapRatio) : null)

/** A stored design, or null when there is none; stops out of range are dropped, never throws. */
export function decodeDesign(v: unknown): Design | null {
  if (!isObj(v) || !Array.isArray(v.feeds)) return null
  return {
    baseLevel: Math.round(num(v.baseLevel, -10, 80, 0)),
    feeds: v.feeds.filter(isObj).slice(0, 8).map((f, k) => ({
      id: okId(f.id),
      name: typeof f.name === "string" ? f.name.slice(0, 20) : `F${k + 1}`,
      base: ratio(f.base, 1),
      branches: (Array.isArray(f.branches) ? f.branches : []).filter(isObj).slice(0, 64).map((b) => ({
        id: okId(b.id),
        stops: (Array.isArray(b.stops) ? b.stops : []).filter(isObj).slice(0, 90).map((st) => ({
          id: okId(st.id),
          level: Math.round(num(st.level, -10, 80, 0)),
          tap: tapPct(st.tap),
          split: ratio(st.split, 8),
          serves: Math.round(num(st.serves, 1, 10, 1)),
        })),
      })),
    })),
  }
}

/** Stored optical values over the defaults, field by field. */
export function decodeOptics(v: unknown): Optics {
  if (!isObj(v)) return DEFAULT_OPTICS
  const d = DEFAULT_OPTICS
  const taps = Array.isArray(v.taps)
    ? DEFAULT_TAPS.map((t) => {
        const x = (v.taps as unknown[]).find((y) => isObj(y) && y.pct === t.pct) as Obj | undefined
        return x ? { pct: t.pct, small: num(x.small, 0, 30, t.small), large: num(x.large, 0, 10, t.large) } : t
      })
    : d.taps
  return {
    cls: typeof v.cls === "string" && GPON_CLASSES.includes(v.cls) ? v.cls : d.cls,
    txDbm: num(v.txDbm, -10, 20, d.txDbm),
    ontSensitivity: num(v.ontSensitivity, -40, 0, d.ontSensitivity),
    ontOverload: num(v.ontOverload, -30, 10, d.ontOverload),
    marginDb: num(v.marginDb, 0, 15, d.marginDb),
    connectorDb: num(v.connectorDb, 0, 3, d.connectorDb),
    spliceDb: num(v.spliceDb, 0, 1, d.spliceDb),
    joint: v.joint === "connector" ? "connector" : "splice",
    fixedConnectors: Math.round(num(v.fixedConnectors, 0, 20, d.fixedConnectors)),
    fiberDbKm: num(v.fiberDbKm, 0, 2, d.fiberDbKm),
    floorHeightM: num(v.floorHeightM, 1, 20, d.floorHeightM),
    slackPct: num(v.slackPct, 0, 100, d.slackPct),
    dropSlackM: num(v.dropSlackM, 0, 50, d.dropSlackM),
    taps,
  }
}
