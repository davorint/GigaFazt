import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMockLinkTelemetry } from "./mock"

describe("mock business link (NOC panel)", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("is always tagged simulated and stays within the contracted capacity", () => {
    const src = createMockLinkTelemetry()
    for (const s of src.history(120)) {
      expect(s.simulated).toBe(true)
      expect(s.downGbps).toBeLessThanOrEqual(s.contractedGbps)
      expect(s.upGbps).toBeLessThanOrEqual(s.contractedGbps)
      expect(s.floorsGbps).toHaveLength(4)
    }
  })

  it("cut → detecting (no path) → backup; restore → primary", () => {
    const src = createMockLinkTelemetry()
    expect(src.now()).toMatchObject({ primaryUp: true, activePath: "primary" })
    src.cutPrimary()
    expect(src.now()).toMatchObject({ primaryUp: false, activePath: null })
    vi.advanceTimersByTime(1500)
    expect(src.now()).toMatchObject({ primaryUp: false, activePath: "backup" })
    src.restorePrimary()
    expect(src.now()).toMatchObject({ primaryUp: true, activePath: "primary" })
  })

  it("pushes the cut to subscribers right away", () => {
    const src = createMockLinkTelemetry()
    const seen: (string | null)[] = []
    const stop = src.subscribe((s) => seen.push(s.activePath))
    src.cutPrimary()
    stop()
    expect(seen).toEqual(["primary", null])
  })
})
