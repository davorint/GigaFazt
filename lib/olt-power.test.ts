import { describe, expect, it } from "vitest"
import { powerBill, powerPlan, type PowerPlanInput } from "./olt-power"
import { POWER_SYSTEMS, SOURCES, type Fact } from "./olt-kb"

const base: PowerPlanInput = { loadW: 480, chassis: "ma5800-x7", boards: ["H901PILA", "H901PILA"], system: "ETP4890-A2", mains: "220", hours: 4, spare: true }

describe("OLT power plan", () => {
  it("sizes an external −48 V system: load + battery charging + one spare rectifier", () => {
    const p = powerPlan(base)
    // 480 W / 48 V = 10 A; 4 h / 0.8 usable = 50 Ah; 0.1 C = 5 A; 15 A / 30 A = 1 rectifier + 1 spare.
    expect(p).toMatchObject({ mode: "dc", loadA: 10, chassisA: 40, moduleA: 30, batteryAh: 50, chargeA: 5, modules: 2, issues: [] })
    expect(powerBill(p)).toBe("1 × ETP4890-A2 + 2 × rectificador (30 A) + baterías 48 V de 50 Ah")
  })
  it("at 127 V the rectifiers give half and the page says so", () => {
    const p = powerPlan({ ...base, mains: "127", loadW: 1200 })
    // 25 A + 52 A·0.1… : 1200/48 = 25 A, 4 h → 125 Ah, 12.5 A charge = 37.5 A / 15 A = 3 + 1 spare = 4 > 3 slots.
    expect(p.moduleA).toBe(15)
    expect(p.issues.map((i) => i.code)).toEqual(["tooFewSlots", "lowMains"])
  })
  it("flags a system without a battery port and outputs smaller than the load", () => {
    const p = powerPlan({ ...base, system: "ETP48100-A1", loadW: 1440 })
    expect(p.issues.map((i) => i.code)).toEqual(["outputSmall", "noBattery"])
    expect(p.batteryAh).toBe(0)
  })
  it("an AC board feeds the OLT itself, up to its rated output", () => {
    expect(powerPlan({ ...base, chassis: "ma5608t", boards: ["H801MPWD"], loadW: 180 })).toMatchObject({ mode: "ac", acBoard: { code: "H801MPWD", ratedW: 400 }, issues: [] })
    expect(powerPlan({ ...base, chassis: "ma5608t", boards: ["H801MPWD"], loadW: 450 }).issues).toEqual([{ code: "acOver", board: "H801MPWD", ratedW: 400 }])
    expect(powerPlan({ ...base, boards: [] }).mode).toBe("none")
  })
  it("every power-system figure names a known source", () => {
    const ids = new Set(SOURCES.map((s) => s.id))
    const isFact = (x: unknown): x is Fact<unknown> => !!x && typeof x === "object" && "v" in x && "src" in x
    const all: Fact<unknown>[] = POWER_SYSTEMS.flatMap((s) => [...(Object.values(s) as unknown[]).filter(isFact), s.moduleA.high, s.moduleA.low])
    expect(all.filter((f) => !ids.has(f.src))).toEqual([])
  })
})

describe("boards without published power", () => {
  it("size with the chassis' maximum input current", () => {
    const p = powerPlan({ ...base, loadW: 10, unknownBoards: true })
    // X7: 40 A; 4 h → 200 Ah, 20 A charge; 60 A / 30 A = 2 + 1 spare.
    expect(p).toMatchObject({ fromChassis: true, loadA: 40, batteryAh: 200, chargeA: 20, modules: 3 })
    expect(p.issues[0]).toEqual({ code: "fromChassis", amps: 40 })
    // Known boards: their own sum.
    expect(powerPlan(base).fromChassis).toBe(false)
  })
})
