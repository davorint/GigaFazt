import { describe, expect, it } from "vitest"
import { addRolls, brandOptions, cableDefaults, decodeRoll, fibersFor, modeOf, leftOptions, newRoll, nextCode, percentLeft, rollState, rollTotals, spendMeters } from "./model"

const SPEC = { mode: "sm", env: "exterior", jacket: "", buffer: "", ends: "ninguno", brand: "" } as const

describe("fiber rolls", () => {
  it("adds several identical rolls, numbered after the highest B-<n>, full", () => {
    const got = addRolls([{ code: "B-3" }, { code: "x" }, { code: "B-10" }], { ...SPEC, cable: "drop-plano", strands: 1, fiber: "g657a2", lengthM: 1000, place: "bodega", by: "Ana" }, 3)
    expect(got.map((r) => r.code)).toEqual(["B-11", "B-12", "B-13"])
    expect(got.every((r) => r.leftM === 1000 && r.by === "Ana")).toBe(true)
    expect(new Set(got.map((r) => r.id)).size).toBe(3)
    expect(nextCode([])).toBe(1)
    expect(addRolls([], { ...SPEC, cable: "adss", strands: 12, fiber: "g652d", lengthM: 2000, place: "bodega", by: "" }, 500)).toHaveLength(50)
  })
  it("meters left: used, menu steps, state and percent", () => {
    const r = newRoll({ lengthM: 300, leftM: 300 })
    expect(rollState(r)).toBe("llena")
    const u = spendMeters(r, 45)
    expect([u.leftM, rollState(u), percentLeft(u)]).toEqual([255, "en-uso", 85])
    expect(spendMeters(u, 1000).leftM).toBe(0)
    expect(rollState(spendMeters(u, 1000))).toBe("vacia")
    expect(leftOptions(u)).toEqual([300, 270, 255, 240, 210, 180, 150, 120, 90, 60, 30, 0])
  })
  it("totals per kind of cable, empty rolls apart", () => {
    const a = newRoll({ cable: "drop-plano", strands: 1, fiber: "g657a2", lengthM: 1000, leftM: 1000 })
    const b = newRoll({ cable: "drop-plano", strands: 1, fiber: "g657a2", lengthM: 1000, leftM: 400 })
    const c = newRoll({ cable: "drop-plano", strands: 1, fiber: "g657a2", lengthM: 1000, leftM: 0 })
    const d = newRoll({ cable: "adss", strands: 12, fiber: "g652d", lengthM: 2000, leftM: 2000 })
    const g = rollTotals([a, b, c, d])
    expect(g.map((x) => [x.cable, x.rolls, x.full, x.empty, x.leftM])).toEqual([
      ["adss", 1, 1, 0, 2000],
      ["drop-plano", 2, 1, 1, 1400],
    ])
  })
  it("single mode and multimode standards; a cable fills its usual mode, standard and indoor/outdoor", () => {
    expect(fibersFor("mm")).toEqual(["om1", "om2", "om3", "om4", "om5", "otra"])
    expect(fibersFor("sm")).toEqual(["g657a2", "g657a1", "g652d", "g655", "g654e", "otra"])
    expect([modeOf("om3"), modeOf("g652d"), modeOf("otra")]).toEqual(["mm", "sm", null])
    expect(cableDefaults("drop-plano")).toEqual({ env: "exterior", mode: "sm", fiber: "g657a2" })
    expect(cableDefaults("breakout").env).toBe("interior")
    // Same construction, different mode or indoor/outdoor: separate totals.
    const a = newRoll({ cable: "interior", fiber: "g657a1", env: "interior" })
    const b = newRoll({ cable: "interior", mode: "mm", fiber: "om3", env: "interior" })
    expect(rollTotals([a, b])).toHaveLength(2)
  })
  it("brand menu: FiberHome first, then the brands already used, once each", () => {
    const r = (brand: string) => newRoll({ brand })
    expect(brandOptions([r("Icoptiks"), r("fiberhome"), r(" "), r("icoptiks"), r("Furukawa")])).toEqual(["FiberHome", "Furukawa", "Icoptiks"])
    expect(brandOptions([])).toEqual(["FiberHome"])
  })
  it("reads stored values leniently", () => {
    // Saved before mode, indoor/outdoor and the rest existed.
    const old = decodeRoll({ cable: "interior", strands: 12, fiber: "g657a1", lengthM: 500 })!
    expect([old.mode, old.env, old.jacket, old.buffer, old.ends, old.brand]).toEqual(["sm", "interior", "", "", "ninguno", ""])
    expect(decodeRoll({ fiber: "om4" })!.mode).toBe("mm")
    expect(decodeRoll({ mode: "sm", fiber: "om4" })!.fiber).toBe("otra")
    const full = decodeRoll({ mode: "mm", fiber: "om3", env: "int-ext", jacket: "lszh", buffer: "ajustado", ends: "sc-apc-2", brand: "Icoptiks" })!
    expect([full.mode, full.fiber, full.env, full.jacket, full.buffer, full.ends, full.brand]).toEqual(["mm", "om3", "int-ext", "lszh", "ajustado", "sc-apc-2", "Icoptiks"])
    const r = decodeRoll({ cable: "cobre", strands: 7, fiber: "x", lengthM: 500, leftM: 900, place: "../x", code: "B-1" })!
    expect([r.cable, r.strands, r.fiber, r.lengthM, r.leftM, r.place, r.code]).toEqual(["otro", 1, "otra", 500, 500, "bodega", "B-1"])
    expect(decodeRoll({ lengthM: -5 })!.lengthM).toBe(1000)
    expect(decodeRoll({ lengthM: 300 })!.leftM).toBe(300)
    expect(decodeRoll({ place: "s:sitio-123" })!.place).toBe("s:sitio-123")
    expect(decodeRoll(null)).toBeNull()
  })
})
