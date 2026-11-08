import { describe, expect, it } from "vitest"
import { briefFrom, briefStepComplete, EMPTY_BRIEF } from "./brief"

describe("project brief", () => {
  it("starts from the preset without sharing its arrays", () => {
    const preset = { needs: ["internet" as const], tier: "dedicated" as const }
    const a = briefFrom(preset)
    expect(a).toMatchObject({ needs: ["internet"], tier: "dedicated", space: null })
    a.needs.push("wifi")
    expect(preset.needs).toEqual(["internet"])
  })

  it("only moves on when each step is answered", () => {
    expect(briefStepComplete(0, EMPTY_BRIEF)).toBe(false)
    expect(briefStepComplete(0, { ...EMPTY_BRIEF, needs: ["cabling"] })).toBe(true)
    expect(briefStepComplete(1, { ...EMPTY_BRIEF, space: "offices" })).toBe(false)
    expect(briefStepComplete(1, { ...EMPTY_BRIEF, space: "offices", floors: "2-3" })).toBe(true)
    expect(briefStepComplete(2, { ...EMPTY_BRIEF, people: "11-50" })).toBe(false)
    expect(briefStepComplete(2, { ...EMPTY_BRIEF, people: "11-50", when: "asap" })).toBe(true)
    expect(briefStepComplete(3, EMPTY_BRIEF)).toBe(true)
  })
})
