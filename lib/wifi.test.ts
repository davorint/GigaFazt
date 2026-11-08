import { describe, expect, it } from "vitest"
import {
  BAND_IDS,
  DEVICES,
  GENERATIONS,
  ROUTER_START,
  WALL_LOSS_DB,
  clampRouter,
  getGeneration,
  linkFor,
  quality,
  roomAt,
  signalDbm,
  wallsCrossed,
} from "./wifi"
import { SIM_H, SIM_W, buildMask, wallDamping, WAVELENGTH_CELLS, CELL_M, SIM_C, WALL_SPEED } from "./wifi-sim"
import { WALL_THICKNESS_M } from "./wifi"

describe("wifi generations", () => {
  it("are ordered and only Wi-Fi 7 has MLO", () => {
    const years = GENERATIONS.map((g) => g.year)
    expect([...years].sort((a, b) => a - b)).toEqual(years)
    expect(GENERATIONS.filter((g) => g.mlo).map((g) => g.id)).toEqual(["wifi7"])
  })
  it("theoretical maxima match streams × channel × modulation growth", () => {
    expect(getGeneration("wifi7").maxGbps).toBeGreaterThan(getGeneration("wifi6").maxGbps * 4)
    expect(getGeneration("wifi6e").maxGbps).toBe(getGeneration("wifi6").maxGbps)
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
  it("Wi-Fi 5 only uses 5 GHz", () => {
    for (const d of DEVICES) expect(linkFor(getGeneration("wifi5"), ROUTER_START, d.at).bands).toEqual(["b5"])
  })
  it("non-MLO generations use one band; Wi-Fi 7 combines bands near the modem", () => {
    const near = { x: ROUTER_START.x + 1, y: ROUTER_START.y + 1 }
    expect(linkFor(getGeneration("wifi6e"), ROUTER_START, near).bands).toHaveLength(1)
    expect(linkFor(getGeneration("wifi6e"), ROUTER_START, near).bands).toEqual(["b6"])
    expect(linkFor(getGeneration("wifi7"), ROUTER_START, near).bands).toEqual([...BAND_IDS])
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
