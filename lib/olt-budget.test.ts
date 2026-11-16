import { describe, expect, it } from "vitest"
import { DEFAULT_BUDGET, opticBudget, splitterLoss } from "./olt-budget"

describe("PON optical budget", () => {
  it("uses the sourced splitter maximums", () => {
    expect(splitterLoss(8)).toBe(10.7)
    expect(splitterLoss(32)).toBe(17.2)
    expect(splitterLoss(3)).toBeNull()
  })
  it("default: 1:64 in two 1:8 stages over 2 km fits B+ with the 3 dB margin", () => {
    const r = opticBudget(DEFAULT_BUDGET)
    // 2 × 10.7 + 2 × 0.35 + 4 × 0.5 + 4 × 0.1 = 21.4 + 0.7 + 2 + 0.4 = 24.5 dB.
    expect(r.total).toBe(24.5)
    expect(r.ratio).toBe(64)
    expect(r.classes.map((c) => [c.id, c.spare, c.verdict])).toEqual([
      ["B+", 1, "ok"],
      ["C+", 4.5, "ok"],
      ["C++", 7.5, "ok"],
    ])
    expect(r.pick).toBe("B+")
  })
  it("1:128 (1:4 + 1:32) over 10 km needs C+, and a long run with many connectors needs C++ or nothing", () => {
    const r = opticBudget({ ...DEFAULT_BUDGET, km: 10, splitters: [4, 32] })
    // 7.4 + 17.2 + 3.5 + 2 + 0.4 = 30.5 dB: B+ over budget, C+ only by eating the margin, C++ fits.
    expect(r.total).toBe(30.5)
    expect(r.classes.find((c) => c.id === "B+")?.verdict).toBe("no")
    expect(r.classes.find((c) => c.id === "C+")?.verdict).toBe("tight")
    expect(r.pick).toBe("C++")
    expect(opticBudget({ ...DEFAULT_BUDGET, km: 20, splitters: [64, 2], connectors: 10 }).pick).toBeNull()
  })
})
