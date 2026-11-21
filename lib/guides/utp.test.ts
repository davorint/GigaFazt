import { describe, expect, it } from "vitest"
import { T568A, T568B } from "./utp"

const label = (ws: typeof T568B) => ws.map((w) => (w.white ? `b/${w.color}` : w.color)).join(" ")

describe("UTP color order (TIA-568)", () => {
  it("T568B and T568A pin by pin", () => {
    expect(label(T568B)).toBe("b/naranja naranja b/verde azul b/azul verde b/cafe cafe")
    expect(label(T568A)).toBe("b/verde verde b/naranja azul b/azul naranja b/cafe cafe")
  })
  it("A is B with the orange and green pairs swapped (pins 1-2 with 3-6)", () => {
    expect([2, 5, 0, 3, 4, 1, 6, 7].map((i) => T568B[i])).toEqual(T568A)
  })
})
