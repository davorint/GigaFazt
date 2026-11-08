import { describe, expect, it } from "vitest"
import {
  DEVICES,
  GENERATIONS,
  ROUTER_START,
  WALL_LOSS_DB,
  dataDensity,
  clampRouter,
  getGeneration,
  lineup,
  linkFor,
  quality,
  roomAt,
  signalDbm,
  wallsCrossed,
} from "./wifi"
import { MATERIAL_IDS, BAND_IDS } from "./wifi"
import { SIM_H, SIM_W, buildMedium, WAVELENGTH_CELLS, WALL_CELLS, SIM_C, dampByte, zByte } from "./wifi-sim"
import { WALL_MEDIUM } from "./wifi-walls"
import { replicaWall } from "./wifi-replica"
import { slabDb, wallReflectionTable } from "./wall-physics"

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
  it("walls are whole cells, at least two thick", () => {
    for (const m of MATERIAL_IDS) expect(WALL_CELLS[m]).toBeGreaterThanOrEqual(2)
  })
  it("builds full RGBA damping and impedance textures with every wall type in them", () => {
    const { damp, imp } = buildMedium()
    expect(damp).toHaveLength(SIM_W * SIM_H * 4)
    expect(imp).toHaveLength(SIM_W * SIM_H * 4)
    const ks = new Set<number>()
    for (let i = 1; i < damp.length; i += 4) ks.add(damp[i])
    for (const m of MATERIAL_IDS) expect(ks.has(dampByte(WALL_MEDIUM[m].b5.k))).toBe(true)
    const zs = new Set<number>()
    for (let i = 0; i < imp.length; i += 4) zs.add(imp[i])
    expect(zs.has(0)).toBe(true) // air
    expect(zs.has(zByte(WALL_MEDIUM.concrete.b24.z))).toBe(true)
  })
})

describe("wall physics (ITU-R P.2040)", () => {
  it("15 cm of concrete loses about what the reference table says, more at higher bands", () => {
    const c = [2.44, 5.5, 6.5].map((f) => -slabDb([{ m: "concrete", t: 0.15 }], f).t)
    expect(Math.abs(c[0] - WALL_LOSS_DB.concrete.b24)).toBeLessThan(1.5)
    expect(Math.abs(c[1] - WALL_LOSS_DB.concrete.b5)).toBeLessThan(1.5)
    expect(c[2]).toBeGreaterThan(c[1])
  })
  it("a concrete wall reflects about 16 % of the power in every band", () => {
    const r = wallReflectionTable().concrete
    for (const b of BAND_IDS) expect(r[b]).toBeGreaterThan(-9)
    for (const b of BAND_IDS) expect(r[b]).toBeLessThan(-7)
  })
})

describe("wall calibration (lib/wifi-walls, generated)", () => {
  it("every wall loses more at higher bands", () => {
    for (const m of MATERIAL_IDS) {
      const t = BAND_IDS.map((b) => WALL_MEDIUM[m][b].t)
      expect(t[1]).toBeGreaterThan(t[0])
      expect(t[2]).toBeGreaterThan(t[1])
    }
  })
  it("matches the reference loss and, within the grid's reach, the ITU reflection", () => {
    const r = wallReflectionTable()
    for (const m of MATERIAL_IDS)
      for (const b of BAND_IDS) {
        const w = WALL_MEDIUM[m][b]
        expect(Math.abs(w.t - WALL_LOSS_DB[m][b])).toBeLessThan(0.5)
        // Loss alone already reflects some on a coarse grid: never less than the target.
        if (w.z > 1.01) expect(Math.abs(w.r - r[m][b])).toBeLessThan(0.5)
        else expect(w.r).toBeGreaterThanOrEqual(r[m][b] - 0.5)
      }
  })
  it("the stored figures are what the simulation does (1D replica of the shader)", () => {
    for (const [m, b] of [["concrete", "b5"], ["drywall", "b24"]] as const) {
      const w = WALL_MEDIUM[m][b]
      const got = replicaWall(WAVELENGTH_CELLS[b], WALL_CELLS[m], w.z, w.k)
      expect(got.t).toBeCloseTo(w.t, 1)
      expect(got.r).toBeCloseTo(w.r, 1)
    }
  })
})

describe("dataDensity (wave lab data rings per generation)", () => {
  it("rises strictly with each generation and tops out at 1", () => {
    const d = GENERATIONS.map((g) => dataDensity(g, GENERATIONS))
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
    expect(d.at(-1)).toBe(1)
    expect(d[0]).toBeGreaterThanOrEqual(0.1)
  })
  it("shows Wi-Fi 7 with several times Wi-Fi 4's rings", () => {
    const d4 = dataDensity(getGeneration("wifi4"), GENERATIONS)
    expect(1 / d4).toBeGreaterThan(5)
  })
  it("rates the plan's modem against the page's lineup", () => {
    expect(dataDensity(getGeneration("modem"), lineup(true))).toBe(1)
  })
})
