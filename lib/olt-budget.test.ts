import { describe, expect, it } from "vitest"
import { DEFAULT_BUDGET, ONT_DEFAULTS, opticBudget, splitterLoss } from "./olt-budget"

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
      // C+++: min(6 − (−27), 0.5 − (−33)) = min(33, 33.5) = 33 dB, set by the downstream.
      ["C+++", 5.5, "ok"],
      // C++++: min(9 + 27, 0.5 + 33) = 33.5 dB: the upstream limits it, barely above C+++.
      ["C++++", 6, "ok"],
    ])
    expect(r.classes.find((c) => c.id === "C++++")).toMatchObject({ budget: 33.5, limit: "up" })
    expect(r.classes.find((c) => c.id === "C+++")).toMatchObject({ budget: 33, limit: "down" })
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

describe("high-power modules on short runs", () => {
  it("C++++ overloads the ONT when the loss is low; the pick skips it", () => {
    // One 1:32 splitter, 0.3 km, 2 connectors, no splices: 17.2 + 0.1 + 1 = 18.3 dB.
    const r = opticBudget({ ...DEFAULT_BUDGET, km: 0.3, splitters: [32], connectors: 2, splices: 0 })
    expect(r.total).toBe(18.3)
    // C++++ transmits up to +13 dBm; the ONT takes up to −8: it needs at least 21 dB of loss.
    expect(r.classes.find((c) => c.id === "C++++")).toMatchObject({ overload: true, minLoss: 21 })
    // C+++ (+10) needs 18 dB: just fine.
    expect(r.classes.find((c) => c.id === "C+++")).toMatchObject({ overload: false, minLoss: 18 })
    expect(r.classes.find((c) => c.id === "B+")?.overload).toBe(false)
    expect(r.pick).toBe("B+")
  })
  it("a stronger ONT raises the upstream limit of C++++", () => {
    const r = opticBudget({ ...DEFAULT_BUDGET, ontTx: 4 })
    // min(9 + 27, 4 + 33) = 36: now the downstream sets it.
    expect(r.classes.find((c) => c.id === "C++++")).toMatchObject({ budget: 36, limit: "down" })
  })

  it("compares only the classes of the chosen PON type", () => {
    expect(opticBudget(DEFAULT_BUDGET).classes.map((c) => c.id)).toEqual(["B+", "C+", "C++", "C+++", "C++++"])
    const xgs = opticBudget({ ...DEFAULT_BUDGET, tech: "xgspon", ...ONT_DEFAULTS.xgspon })
    expect(xgs.classes.map((c) => c.id)).toEqual(["N1", "N2", "E1", "Combo C+ (34062610)", "Combo D (34062990)"])
    // ITU classes publish no maximum power: no overload check.
    expect(xgs.classes[0]).toMatchObject({ budget: 29, minLoss: null, overload: false })
    // Combo C+: min(5 + 28, 4 + 29) = 33 either way; combo D: min(6 + 28, 4 + 32) = 34 by the downstream.
    expect(xgs.classes[3]).toMatchObject({ budget: 33 })
    expect(xgs.classes[4]).toMatchObject({ budget: 34, limit: "down" })
  })
})
