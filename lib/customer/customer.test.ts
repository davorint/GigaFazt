import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { parseQuery } = await import("./server")

describe("client area lookups", () => {
  it("a report code in any spelling, or a Mexican phone; anything else refused", () => {
    expect(parseQuery("R-1a2b3c")).toEqual({ code: "1A2B3C" })
    expect(parseQuery(" r1A2B3C ")).toEqual({ code: "1A2B3C" })
    expect(parseQuery("+52 (55) 1234-5678")).toEqual({ phone: "5512345678" })
    expect(parseQuery("55 1234 5678")).toEqual({ phone: "5512345678" })
    expect(parseQuery("12345")).toBeNull()
    expect(parseQuery("R-12")).toBeNull()
    expect(parseQuery("' or 1=1 --")).toBeNull()
  })
})
