import { describe, expect, it } from "vitest"
import { recommend, scoreOf, tierOf, type RecommendInput } from "./recommend"

const PLANS = [
  { id: "10g", downMbps: 10000, upMbps: 10000 },
  { id: "1g", downMbps: 1000, upMbps: 1000 },
  { id: "2.5g", downMbps: 2500, upMbps: 2500 },
]

describe("scoreOf", () => {
  it("sums people, uses and wfh points", () => {
    expect(scoreOf({ people: "1-2", uses: [], wfh: "no" })).toBe(1)
    expect(scoreOf({ people: "3-5", uses: ["gaming", "creator"], wfh: "one" })).toBe(2 + 1 + 3 + 1)
    expect(
      scoreOf({
        people: "6+",
        uses: ["gaming", "streaming4k", "homeOffice", "creator", "smartHome"],
        wfh: "several",
      })
    ).toBe(4 + 7 + 2)
  })
  it("ignores duplicate uses", () => {
    expect(scoreOf({ people: "1-2", uses: ["gaming", "gaming"], wfh: "no" })).toBe(2)
  })
})

describe("tierOf", () => {
  it("maps score boundaries to tiers", () => {
    expect([1, 4, 5, 8, 9, 20].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2])
  })
})

describe("recommend", () => {
  it("sorts candidates by speed, so input order doesn't matter", () => {
    const r = recommend({ people: "1-2", uses: [], wfh: "no" }, PLANS)
    expect(r).toMatchObject({ planId: "1g", tier: 0, reason: "light" })
  })
  it("recommends the middle tier for a creator household", () => {
    const r = recommend({ people: "3-5", uses: ["creator"], wfh: "no" }, PLANS)
    expect(r).toMatchObject({ planId: "2.5g", score: 5, reason: "creator" })
  })
  it("recommends the top tier for a large, heavy household", () => {
    const r = recommend(
      { people: "6+", uses: ["gaming", "creator", "streaming4k"], wfh: "several" },
      PLANS
    )
    expect(r.planId).toBe("10g")
  })
  it("names people as the reason when it dominates", () => {
    const r = recommend({ people: "6+", uses: ["gaming"], wfh: "no" }, PLANS)
    expect(r).toMatchObject({ planId: "2.5g", reason: "people" })
  })
  it("is deterministic for equal inputs", () => {
    const input: RecommendInput = { people: "3-5", uses: ["homeOffice", "smartHome"], wfh: "several" }
    expect(recommend({ ...input }, PLANS)).toEqual(recommend({ ...input }, PLANS))
  })
  it("bumps the tier when the plan isn't 2× the current connection", () => {
    const r = recommend(
      { people: "1-2", uses: [], wfh: "no", current: { downMbps: 900, upMbps: 100 } },
      PLANS
    )
    expect(r).toMatchObject({ planId: "2.5g", reason: "upgrade" })
  })
  it("does not bump for a slow current connection", () => {
    const r = recommend(
      { people: "1-2", uses: [], wfh: "no", current: { downMbps: 87, upMbps: 11 } },
      PLANS
    )
    expect(r.planId).toBe("1g")
  })
  it("caps at the top tier and never claims 2x when it can't deliver it", () => {
    const r = recommend(
      { people: "6+", uses: ["creator"], wfh: "several", current: { downMbps: 9000, upMbps: 9000 } },
      PLANS
    )
    expect(r).toMatchObject({ planId: "10g", reason: "top" })
  })
  it("uses 'top' when bumped to the top tier but still under 2x", () => {
    const r = recommend(
      { people: "1-2", uses: [], wfh: "no", current: { downMbps: 900, upMbps: 900 } },
      [PLANS[1]]
    )
    expect(r).toMatchObject({ planId: "1g", reason: "top" })
  })
  it("works with fewer candidates than tiers", () => {
    const r = recommend({ people: "6+", uses: ["creator"], wfh: "several" }, [PLANS[1]])
    expect(r.planId).toBe("1g")
  })
  it("throws with no candidates", () => {
    expect(() => recommend({ people: "1-2", uses: [], wfh: "no" }, [])).toThrow()
  })
})
