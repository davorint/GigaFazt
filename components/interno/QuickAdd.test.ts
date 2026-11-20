import { describe, expect, it } from "vitest"
import { readAmount } from "./QuickAdd"

describe("amounts typed in quick-add forms (owner review 2026-11-20)", () => {
  it("reads cents, thousands commas, a decimal comma and the peso sign", () => {
    expect(readAmount("2500.50")).toBe(2500.5)
    expect(readAmount("$2,500.50")).toBe(2500.5)
    expect(readAmount("12,000")).toBe(12000)
    expect(readAmount("2500,5")).toBe(2500.5)
    expect(readAmount(" 396 ")).toBe(396)
    expect(readAmount("abc")).toBe(0)
    expect(readAmount("-5")).toBe(0)
  })
})
