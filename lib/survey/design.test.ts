import { describe, expect, it } from "vitest"
import { DEFAULT_OPTICS, balancedDesign, decodeDesign, decodeOptics, designResults, ratioFor, suggestTaps, summarize, tapDesign, type Design } from "./design"
import { emptyTower, syncFloors, type Tower } from "./model"

/** 10 levels (PB + 9), 8 apartments per floor, 20 m to the farthest door, 3 m between floors. */
const tower = (): Tower => {
  const t = syncFloors({ ...emptyTower("A"), floorsAbove: 10, floorsBelow: 0, floorHeightM: 3 })
  return { ...t, floors: t.floors.map((f) => ({ ...f, units: 8, farthestM: 20 })) }
}
const room = { room: { toDuctM: 15 } }

describe("the owner's balanced layout", () => {
  it("one feed, a box every two floors: base 1:8 for 5 boxes, 1:16 per box for 16 apartments", () => {
    const d = balancedDesign(tower(), { feeds: 1, perBox: 2, base: "auto", floor: "auto" })
    expect(d.feeds).toHaveLength(1)
    expect(d.feeds[0].base).toBe(8)
    expect(d.feeds[0].branches.map((b) => b.stops[0].level)).toEqual([0, 2, 4, 6, 8])
    expect(d.feeds[0].branches.every((b) => b.stops[0].split === 16 && b.stops[0].serves === 2 && b.stops[0].tap === null)).toBe(true)
  })
  it("light: 3 connectors 1.5 + base 1:8 10.7 + floor 1:16 14.0 + 4 splices 0.4 + fiber ≈ 26.6 dB → C+ (3 dBm) gets ≈ −23.6 dBm, 0.4 dB over the 3 dB margin", () => {
    const t = tower()
    const r = designResults(t, balancedDesign(t, { feeds: 1, perBox: 2, base: "auto", floor: "auto" }), room, DEFAULT_OPTICS)
    expect(r).toHaveLength(5)
    expect(r[0].lossDb).toBeCloseTo(26.6, 1)
    expect(r[0].rxDbm).toBeCloseTo(-23.6, 1)
    expect(r.every((x) => x.status === "ok")).toBe(true)
    // Higher floors: a little more fiber, the same light to 0.1 dB.
    expect(Math.abs(r[4].rxDbm - r[0].rxDbm)).toBeLessThanOrEqual(0.1)
    expect(r.map((x) => x.units)).toEqual([16, 16, 16, 16, 16])
  })
  it("two feeds share the floors in order (feed 1 the lower ones)", () => {
    const t = tower()
    const d = balancedDesign(t, { feeds: 2, perBox: 1, base: "auto", floor: "auto" })
    expect(d.feeds.map((f) => f.branches.map((b) => b.stops[0].level))).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ])
    expect(d.feeds.map((f) => f.base)).toEqual([8, 8])
    const s = summarize(t, d, designResults(t, d, room, DEFAULT_OPTICS))
    expect(s).toMatchObject({ ports: 80, units: 80, uncovered: [], short: 0, overBase: [] })
  })
  it("ratios: the smallest that covers", () => {
    expect([1, 2, 3, 8, 9, 40, 100].map(ratioFor)).toEqual([2, 2, 4, 8, 16, 64, 64])
  })
})

describe("unbalanced riser", () => {
  it("suggested taps grow up the riser, the last stop takes what's left, and beat a fixed 10/90 everywhere", () => {
    const t = tower()
    const o = { ...DEFAULT_OPTICS, cls: "C++", txDbm: 6 }
    const d = tapDesign(t, { feeds: 1, perBox: 2, floor: 16 }, o)
    const stops = d.feeds[0].branches[0].stops
    expect(stops).toHaveLength(5)
    expect(stops.at(-1)!.tap).toBeNull()
    const taps = stops.slice(0, -1).map((s) => s.tap!)
    expect([...taps].sort((a, b) => a - b)).toEqual(taps) // never smaller further up
    const r = designResults(t, d, room, o)
    const fixed: Design = { ...d, feeds: [{ ...d.feeds[0], branches: [{ ...d.feeds[0].branches[0], stops: stops.map((s, i) => ({ ...s, tap: i === stops.length - 1 ? null : 10 })) }] }] }
    const rf = designResults(t, fixed, room, o)
    expect(Math.min(...r.map((x) => x.rxDbm))).toBeGreaterThan(Math.min(...rf.map((x) => x.rxDbm)))
    // The through light is reported after every tap but the last stop.
    expect(r.slice(0, -1).every((x) => x.throughDbm !== null)).toBe(true)
  })
  it("a single stop takes no tap", () => {
    const t = tower()
    const d = tapDesign(t, { feeds: 1, perBox: 1, floor: 8 }, DEFAULT_OPTICS)
    const one = { id: "b-123456", stops: [d.feeds[0].branches[0].stops[0]] }
    expect(suggestTaps(one, d.feeds[0], d, t, DEFAULT_OPTICS).stops[0].tap).toBeNull()
  })
})

describe("status and checks", () => {
  it("too little light, too much light, a tap kept for later", () => {
    const t = tower()
    const d = balancedDesign(t, { feeds: 1, perBox: 2, base: 64, floor: 64 })
    expect(designResults(t, d, room, DEFAULT_OPTICS)[0].status).toBe("no")
    const hot = balancedDesign(t, { feeds: 1, perBox: 2, base: 2, floor: 2 })
    expect(designResults(t, hot, room, { ...DEFAULT_OPTICS, txDbm: 9 })[0].status).toBe("overload")
    const later = { ...d, feeds: [{ ...d.feeds[0], branches: [{ ...d.feeds[0].branches[0], stops: [{ ...d.feeds[0].branches[0].stops[0], split: 0 }] }] }] }
    expect(designResults(t, later, room, DEFAULT_OPTICS)[0].status).toBe("noSplit")
  })
  it("uncovered floors, short splitters, more branches than base outputs", () => {
    const t = tower()
    const d = balancedDesign(t, { feeds: 1, perBox: 2, base: 4, floor: 8 })
    const s = summarize(t, d, designResults(t, d, room, DEFAULT_OPTICS))
    expect(s.overBase).toEqual(["F1"])
    expect(s.short).toBe(5)
    const missing = { ...d, feeds: [{ ...d.feeds[0], branches: d.feeds[0].branches.slice(0, 4) }] }
    expect(summarize(t, missing, designResults(t, missing, room, DEFAULT_OPTICS)).uncovered).toEqual([8, 9])
  })
})

describe("reading stored designs", () => {
  it("round trip and hostile input", () => {
    const d = balancedDesign(tower(), { feeds: 2, perBox: 2, base: "auto", floor: "auto" })
    expect(decodeDesign(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(decodeDesign(null)).toBeNull()
    expect(decodeDesign({ feeds: [{ base: 7, branches: [{ stops: [{ level: 999, tap: 15, split: 3, serves: -1 }] }] }] })?.feeds[0]).toMatchObject({
      base: 1,
      branches: [{ stops: [{ level: 0, tap: null, split: 8, serves: 1 }] }],
    })
    expect(decodeOptics({ cls: "Z", txDbm: 99, joint: "connector", taps: [{ pct: 10, small: 12, large: 0.5 }] })).toMatchObject({ cls: "C+", txDbm: 3, joint: "connector" })
    expect(decodeOptics({ taps: [{ pct: 10, small: 12, large: 0.5 }] }).taps.find((x) => x.pct === 10)).toEqual({ pct: 10, small: 12, large: 0.5 })
  })
})
