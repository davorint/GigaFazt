import { describe, expect, it } from "vitest"
import {
  DEVICES,
  GENERATIONS,
  ROUTER_START,
  WALL_LOSS_DB,
  burstFill,
  clampRouter,
  getGeneration,
  lineup,
  linkFor,
  quality,
  roomAt,
  signalDbm,
  wallsCrossed,
} from "./wifi"
import { SIM_H, SIM_W, buildMask, wallDamping, WAVELENGTH_CELLS, CELL_M, SIM_C, WALL_SPEED } from "./wifi-sim"
import { WALL_THICKNESS_M } from "./wifi"

describe("wifi generations (dual-band 2 × 2 home modems)", () => {
  it("are ordered and only Wi-Fi 7 has MLO", () => {
    const years = GENERATIONS.map((g) => g.year ?? 0)
    expect([...years].sort((a, b) => a - b)).toEqual(years)
    expect(GENERATIONS.filter((g) => g.mlo).map((g) => g.id)).toEqual(["wifi7"])
  })
  it("compare like for like: same bands and streams, rising speed", () => {
    for (const g of GENERATIONS) {
      expect(g.bands).toEqual(["b24", "b5"])
      expect(g.streams).toBe(4)
    }
    const speeds = GENERATIONS.map((g) => g.maxGbps)
    expect([...speeds].sort((a, b) => a - b)).toEqual(speeds)
    expect(getGeneration("wifi4").maxGbps).toBeCloseTo(0.6, 3)
    expect(getGeneration("wifi6").maxGbps).toBeCloseTo(2.976, 3)
  })
  it("the plan's modem leads the lineup and equals a dual-band 2 × 2 Wi-Fi 7", () => {
    const l = lineup(true)
    expect(l.map((g) => g.id)).toEqual(["wifi4", "wifi5", "wifi6", "modem"])
    expect(Math.max(...l.map((g) => g.maxGbps))).toBe(getGeneration("modem").maxGbps)
    expect(getGeneration("modem").maxGbps).toBeCloseTo(getGeneration("wifi7").maxGbps, 6)
    expect(lineup(false).map((g) => g.id)).toEqual(["wifi4", "wifi5", "wifi6", "wifi7"])
  })
})

describe("plan modem profile", () => {
  it("is dual band (no 6 GHz) with MLO across 2.4 + 5 GHz", () => {
    const modem = getGeneration("modem")
    expect(modem.bands).toEqual(["b24", "b5"])
    expect(modem.maxChannelMhz).toBe(160)
    expect(modem.streams).toBe(4)
    expect(modem.maxGbps).toBeCloseTo(3.57, 2)
    const near = { x: ROUTER_START.x + 1, y: ROUTER_START.y + 1 }
    expect(linkFor(modem, ROUTER_START, near).bands).toEqual(["b24", "b5"])
  })
})

describe("wall crossings", () => {
  it("counts the walls on a straight line", () => {
    // living room → master bedroom: through the open kitchen, one brick wall…
    expect(wallsCrossed({ x: 3, y: 2 }, { x: 10, y: 2 }).map((w) => w.m)).toEqual(["brick"])
    // …or, near the façade, through both kitchen walls
    expect(wallsCrossed({ x: 3, y: 0.8 }, { x: 10, y: 0.8 }).map((w) => w.m)).toEqual(["brick", "brick"])
    // inside one room: none
    expect(wallsCrossed({ x: 1, y: 1 }, { x: 5, y: 3 })).toHaveLength(0)
    // through a door gap: none
    expect(wallsCrossed({ x: 2.7, y: 4 }, { x: 2.7, y: 5 })).toHaveLength(0)
  })
  it("higher bands lose more through the same walls", () => {
    const p = { x: 3, y: 2 }
    const q = { x: 10, y: 2 }
    expect(signalDbm(p, q, "b24")).toBeGreaterThan(signalDbm(p, q, "b5"))
    expect(signalDbm(p, q, "b5")).toBeGreaterThan(signalDbm(p, q, "b6"))
  })
})

describe("links", () => {
  it("non-MLO generations use one band per device", () => {
    for (const id of ["wifi4", "wifi5", "wifi6"] as const)
      for (const d of DEVICES) expect(linkFor(getGeneration(id), ROUTER_START, d.at).bands).toHaveLength(1)
  })
  it("Wi-Fi 7 combines both bands near the modem", () => {
    const near = { x: ROUTER_START.x + 1, y: ROUTER_START.y + 1 }
    expect(linkFor(getGeneration("wifi6"), ROUTER_START, near).bands).toEqual(["b5"])
    expect(linkFor(getGeneration("wifi7"), ROUTER_START, near).bands).toEqual(["b24", "b5"])
  })
  it("quality thresholds", () => {
    expect(quality(-50)).toBe("excellent")
    expect(quality(-65)).toBe("good")
    expect(quality(-72)).toBe("fair")
    expect(quality(-80)).toBe("weak")
  })
  it("keeps the router inside the apartment and finds its room", () => {
    expect(clampRouter({ x: -3, y: 99 })).toEqual({ x: 0.25, y: 7.25 })
    expect(roomAt(ROUTER_START)).toBe("living")
    expect(roomAt({ x: 10, y: 6 })).toBe("bath")
  })
})

describe("simulation medium", () => {
  it("resolves the shortest wavelength with enough cells and stays stable", () => {
    expect(Math.min(...Object.values(WAVELENGTH_CELLS))).toBeGreaterThanOrEqual(8)
    expect(SIM_C).toBeLessThanOrEqual(Math.SQRT1_2)
  })
  it("wall damping reproduces the reference loss over one crossing", () => {
    const steps = WALL_THICKNESS_M.concrete / CELL_M / (SIM_C * WALL_SPEED)
    const amp = Math.pow(1 - wallDamping("concrete", "b5"), steps)
    expect(-20 * Math.log10(amp)).toBeCloseTo(WALL_LOSS_DB.concrete.b5, 5)
  })
  it("builds a full RGBA mask with walls slower than air", () => {
    const m = buildMask()
    expect(m).toHaveLength(SIM_W * SIM_H * 4)
    const speeds = new Set<number>()
    for (let i = 3; i < m.length; i += 4) speeds.add(m[i])
    expect([...speeds].sort((a, b) => a - b)).toEqual([Math.round(WALL_SPEED * 255), 255])
  })
})

describe("burstFill (wave lab data density per generation)", () => {
  it("differs between every pair of generations on at least one band", () => {
    const fills = GENERATIONS.map((g) => burstFill(g, GENERATIONS))
    for (let i = 0; i < fills.length; i++)
      for (let j = i + 1; j < fills.length; j++) expect(fills[i]).not.toEqual(fills[j])
  })
  it("rises with each generation, tops out at 1 and never drops below the floor", () => {
    const fills = GENERATIONS.map((g) => burstFill(g, GENERATIONS))
    for (const b of ["b24", "b5"] as const) {
      const v = fills.map((f) => f[b])
      expect([...v].sort((x, y) => x - y)).toEqual(v)
      expect(v.at(-1)).toBe(1)
      expect(Math.min(...v)).toBeGreaterThanOrEqual(0.1)
    }
    expect(fills.every((f) => f.b6 === 0)).toBe(true)
  })
  it("treats the plan's modem against the page's lineup", () => {
    const compared = lineup(true)
    const modem = getGeneration("modem")
    expect(burstFill(modem, compared).b5).toBe(1)
  })
})
