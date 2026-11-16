import { describe, expect, it } from "vitest"
import { BOARDS, CHASSIS, OPTICS, SOURCES, type Fact } from "./olt-kb"
import { matchInternal } from "./internal-pages"

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

describe("/olt is an internal page", () => {
  it("rewrites any capitalization to the Spanish route", () => {
    expect(matchInternal("/OLT")).toEqual({ rewriteTo: "/es/olt" })
    expect(matchInternal("/olt")).toEqual({ rewriteTo: "/es/olt" })
    expect(matchInternal("/es/olt")).toEqual({ rewriteTo: null })
    expect(matchInternal("/ES/Olt")).toEqual({ rewriteTo: "/es/olt" })
    expect(matchInternal("/olte")).toBeNull()
    expect(matchInternal("/es/planes")).toBeNull()
  })
})
