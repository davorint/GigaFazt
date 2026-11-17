import { describe, expect, it } from "vitest"
import { BOARDS, BUDGETS, CHASSIS, FAN_TRAYS, CVE_9067, DOWN_CAUSES, MODULES, ONTS, OPTICS, SOURCES, TROUBLE, compareVersions, type Fact } from "./olt-kb"
import { LAYOUTS } from "./olt-build"

const isFact = (x: unknown): x is Fact<unknown> => !!x && typeof x === "object" && "v" in x && "src" in x
const facts = (o: object): Fact<unknown>[] => Object.values(o).filter(isFact)
const ids = new Set(SOURCES.map((s) => s.id))

describe("OLT knowledge base data", () => {
  it("every value names a known source", () => {
    const all = [...CHASSIS.flatMap(facts), ...BOARDS.flatMap(facts), ...OPTICS.flatMap(facts)]
    expect(all.length).toBeGreaterThan(150)
    expect(all.filter((f) => !ids.has(f.src))).toEqual([])
  })
  it("boards point at real chassis, codes are unique, replacements exist or are named", () => {
    const chassis = new Set(CHASSIS.map((c) => c.id))
    expect(BOARDS.flatMap((b) => b.chassis).filter((c) => !chassis.has(c))).toEqual([])
    const codes = BOARDS.map((b) => b.code)
    expect(new Set(codes).size).toBe(codes.length)
    // Every listed replacement is itself in the base.
    expect(BOARDS.flatMap((b) => b.replacedBy?.v ?? []).filter((c) => !codes.includes(c))).toEqual([])
  })
  it("a board is in the family of the chassis it goes in", () => {
    const family = new Map(CHASSIS.map((c) => [c.id, c.family]))
    expect(BOARDS.filter((b) => b.chassis.some((c) => family.get(c) !== b.family)).map((b) => b.code)).toEqual([])
  })
  it("keeps Huawei's figures for the chassis the owner uses", () => {
    const ma5608t = CHASSIS.find((c) => c.id === "ma5608t")
    expect(ma5608t?.serviceSlots).toEqual({ v: "2 (slots 0–1)", src: "hd5600" })
    expect(ma5608t?.controlBoards).toEqual(["H801MCUD", "H801MCUD1", "H801MCUE"])
    const x7 = CHASSIS.find((c) => c.id === "ma5800-x7")
    expect(x7?.minSoftware).toEqual({ v: "V100R016C00", src: "ds5800" })
    expect(BOARDS.find((b) => b.code === "H802GPFD")?.power).toEqual({ v: "45 / 73 W", src: "hd5600" })
  })
})

describe("modules, ONTs, software and faults", () => {
  it("every new value names a known source", () => {
    const all = [...MODULES.flatMap(facts), ...ONTS.flatMap(facts), ...BUDGETS.flatMap(facts), ...DOWN_CAUSES.flatMap(facts), ...facts(CVE_9067)]
    expect(all.length).toBeGreaterThan(80)
    expect(all.filter((f) => !ids.has(f.src))).toEqual([])
    const steps = TROUBLE.flatMap((c) => c.steps)
    expect(steps.filter((s) => !ids.has(s.src))).toEqual([])
    expect(DOWN_CAUSES.filter((c) => !ids.has(c.src))).toEqual([])
  })
  it("part numbers are unique and the company's ONT is marked", () => {
    const boms = MODULES.map((m) => m.bom)
    expect(new Set(boms).size).toBe(boms.length)
    expect(ONTS.filter((o) => o.ours).map((o) => o.model)).toEqual(["EG8145B7-50"])
    // The XGS-PON ONT's sensitivity is Huawei's datasheet figure.
    expect(ONTS.find((o) => o.model === "EN8145B7Ns")?.optics).toMatchObject({ src: "dsEN8145" })
  })
  it("sorts versions by release", () => {
    expect(["V800R013C00", "V800R011C00", "V800R012C00"].sort(compareVersions)).toEqual(["V800R011C00", "V800R012C00", "V800R013C00"])
    expect(compareVersions("V100R016C10", "V100R016C00")).toBeGreaterThan(0)
  })
})

describe("fan trays", () => {
  it("every chassis has one, each in the board list for that chassis, with its watts and a known source", () => {
    for (const c of CHASSIS) expect(FAN_TRAYS.some((f) => f.chassis === c.id), c.id).toBe(true)
    for (const f of FAN_TRAYS) {
      const b = BOARDS.find((x) => x.code === f.code)
      expect(b?.kind, f.code).toBe("fan")
      expect(b?.chassis, f.code).toContain(f.chassis)
      expect(f.power.v).toBe(`${f.w.s} / ${f.w.m} W`)
      for (const fact of [f.fans, f.place, f.dimensions, f.weight, f.power]) expect(SOURCES.some((s) => s.id === fact.src), fact.src).toBe(true)
      if (f.replacedBy) expect(BOARDS.some((x) => x.code === f.replacedBy!.v), f.replacedBy.v).toBe(true)
    }
  })
  it("the builder counts the largest tray of each chassis", () => {
    for (const c of CHASSIS) {
      const max = Math.max(...FAN_TRAYS.filter((f) => f.chassis === c.id).map((f) => f.w.m))
      expect(LAYOUTS[c.id]?.fanW, c.id).toBe(max)
    }
  })
})
