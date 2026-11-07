import { describe, expect, it } from "vitest"
import { fiberRttMs, speedup, splitDuration, streams4k, transferSeconds } from "./fiber-math"

describe("transferSeconds", () => {
  it("uses decimal units", () => {
    expect(transferSeconds(10, 1000)).toBe(80) // 10 GB at 1 Gbps
    expect(transferSeconds(1000, 500)).toBe(16000) // 1 TB at 500 Mbps
  })
  it("is infinite for a zero link", () => {
    expect(transferSeconds(1, 0)).toBe(Infinity)
  })
})

describe("streams4k", () => {
  it("floors at 25 Mbps per stream", () => {
    expect(streams4k(200)).toBe(8)
    expect(streams4k(87)).toBe(3)
    expect(streams4k(10)).toBe(0)
  })
})

describe("fiberRttMs", () => {
  it("is 10 µs per km round trip", () => {
    expect(fiberRttMs(100)).toBeCloseTo(1)
    expect(fiberRttMs(0)).toBe(0)
  })
})

describe("splitDuration", () => {
  it("picks a readable unit", () => {
    expect(splitDuration(8)).toEqual({ value: "8.0", unit: "s" })
    expect(splitDuration(80)).toEqual({ value: "80", unit: "s" })
    expect(splitDuration(7273)).toEqual({ value: "2.0", unit: "h" })
    expect(splitDuration(600)).toEqual({ value: "10", unit: "min" })
    expect(splitDuration(Infinity).value).toBe("∞")
  })
})

describe("speedup", () => {
  it("rounds sensibly", () => {
    expect(speedup(11, 500)).toBe(45)
    expect(speedup(87, 200)).toBe(2.3)
    expect(speedup(0, 1)).toBe(Infinity)
  })
})
