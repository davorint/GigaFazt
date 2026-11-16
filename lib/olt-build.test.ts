import { describe, expect, it } from "vitest"
import { BOARD_NUMBERS, LAYOUTS, boardsFor, decodeBuild, encodeBuild, starter, summarize } from "./olt-build"
import { BOARDS, CHASSIS } from "./olt-kb"

describe("builder numbers match the sourced knowledge base", () => {
  it("every power figure appears in the board's sourced power text", () => {
    const off: string[] = []
    for (const [code, n] of Object.entries(BOARD_NUMBERS)) {
      const b = BOARDS.find((x) => x.code === code)
      if (!b) {
        off.push(`${code}: not in the base`)
        continue
      }
      for (const w of [n.s, n.m].filter((x): x is number => x !== undefined)) if (!(b.power?.v ?? "").includes(String(w))) off.push(`${code}: ${w} W not in "${b.power?.v}"`)
      if (n.pon && !b.ports.v.includes(String(n.pon.ports))) off.push(`${code}: ${n.pon.ports} ports not in "${b.ports.v}"`)
      if (n.pon?.onts && !b.ports.v.includes(`${n.pon.onts} ONT`)) off.push(`${code}: ${n.pon.onts} ONTs not in "${b.ports.v}"`)
    }
    expect(off).toEqual([])
  })
  it("every chassis has a layout whose slot counts match its sourced slot text", () => {
    for (const c of CHASSIS) {
      const l = LAYOUTS[c.id]
      expect(l, c.id).toBeDefined()
      expect(c.serviceSlots.v.startsWith(`${l.service.length} `), c.id).toBe(true)
      expect(c.controlSlots.v.startsWith(`${l.control.length} `), c.id).toBe(true)
      expect(c.powerSlots.v.startsWith(`${l.power.length} `), c.id).toBe(true)
    }
  })
})

describe("what fits where", () => {
  it("MA5608T: MCU control boards, MPW power, no GIU slots", () => {
    expect(boardsFor("ma5608t", "control").map((b) => b.code)).toEqual(["H801MCUD", "H801MCUD1", "H801MCUE"])
    expect(boardsFor("ma5608t", "power").map((b) => b.code)).toEqual(["H801MPWC", "H801MPWD"])
    expect(boardsFor("ma5608t", "service").map((b) => b.code)).toContain("H802GPFD")
    expect(boardsFor("ma5608t", "service").map((b) => b.code)).not.toContain("H901GPHF")
  })
  it("MA5800 uplink boards go in service slots", () => {
    expect(boardsFor("ma5800-x7", "service").map((b) => b.code)).toContain("H901NXED")
  })
})

describe("summary", () => {
  it("the MA5608T starter: 16 GPON ports, 2,048 ONTs, V800R012C00, power with the fan tray", () => {
    const s = summarize(starter("ma5608t"))
    expect(s.ports).toEqual({ gpon: 16 })
    expect(s.onts).toBe(2048)
    expect(s.minVersion).toBe("V800R012C00")
    // 73 (GPFD) + 2 × 33 (MCUD1) + 2 (MPWD, static only) + 39 (fans) = 180 W max.
    expect(s.maxW).toBe(180)
    expect(s.amps48).toBe(3.8)
    expect(s.issues).toEqual([])
    expect(s.bill).toEqual([
      { code: "H802GPFD", count: 1 },
      { code: "H801MCUD1", count: 2 },
      { code: "H801MPWD", count: 1 },
    ])
  })
  it("flags boards a control board doesn't take, missing redundancy and end-of-life boards", () => {
    const s = summarize({ chassis: "ma5608t", slots: { 0: "H802GPBD", 2: "H801MCUE" } })
    const codes = s.issues.map((i) => i.code)
    expect(codes).toContain("oneControl")
    expect(codes).toContain("noPower")
    expect(s.issues).toContainEqual({ code: "notWithControl", board: "H802GPBD", control: "H801MCUE" })
    expect(s.issues).toContainEqual({ code: "endOfLife", board: "H802GPBD", status: "EOM", replacedBy: ["H805GPBD", "H806GPBH"] })
  })
  it("highest minimum version wins; mixed control boards are flagged", () => {
    const s = summarize({ chassis: "ma5603t", slots: { 0: "H802GPFD", 1: "H801GPMD", 6: "H801SCUH", 7: "H801SCUV", 10: "H801PRTE", 11: "H801PRTE" } })
    expect(s.minVersion).toBe("V800R013C00")
    expect(s.issues.map((i) => i.code)).toContain("mixedControl")
    // GPMD only works with SCUV in Huawei's table.
    expect(s.issues).toContainEqual({ code: "notWithControl", board: "H801GPMD", control: "H801SCUH" })
  })
  it("MA5800: chassis minimum software, combo ports, power data marked missing", () => {
    const s = summarize(starter("ma5800-x7"))
    expect(s.minVersion).toBe("V100R016C00")
    expect(s.ports).toEqual({ comboXgs: 16 })
    expect(s.issues.map((i) => i.code)).toContain("noPowerData")
  })
  it("share link round-trips and drops boards that don't belong", () => {
    const b = starter("ma5603t")
    expect(decodeBuild(encodeBuild(b))).toEqual(b)
    expect(decodeBuild("ma5608t;0:H901GPHF,2:H801MCUD")).toEqual({ chassis: "ma5608t", slots: { 2: "H801MCUD" } })
    expect(decodeBuild("nope;1:x")).toBeNull()
  })
})
