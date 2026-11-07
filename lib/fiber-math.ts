/**
 * Pure, documented math behind the Symmetrical Fiber section (SPEC §4).
 * All units are decimal (1 GB = 8×10⁹ bits), speeds in Mbps (10⁶ bit/s).
 * Results are idealized: they assume the full line rate is sustained.
 */

/** Bitrate assumed per 4K stream (Mbps). Common streaming-service guidance is 15–25. */
export const MBPS_PER_4K_STREAM = 25

/** One-way propagation delay in fiber: light travels at ~2/3 c in glass ≈ 5 µs/km. */
export const FIBER_US_PER_KM = 5

/** Seconds to transfer `gigabytes` at `mbps`. */
export function transferSeconds(gigabytes: number, mbps: number): number {
  if (mbps <= 0) return Infinity
  return (gigabytes * 8e9) / (mbps * 1e6)
}

/** Simultaneous 4K streams a downlink can carry (floor). */
export function streams4k(downMbps: number): number {
  return Math.max(0, Math.floor(downMbps / MBPS_PER_4K_STREAM))
}

/** Round-trip propagation time over `km` of fiber, in ms. */
export function fiberRttMs(km: number): number {
  return (2 * km * FIBER_US_PER_KM) / 1000
}

export type DurationUnit = "s" | "min" | "h"

/** Human-sized duration: < 90 s → s, < 90 min → min, else h. */
export function splitDuration(seconds: number): { value: string; unit: DurationUnit } {
  if (!Number.isFinite(seconds)) return { value: "∞", unit: "h" }
  if (seconds < 90) {
    return { value: seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds)), unit: "s" }
  }
  const minutes = seconds / 60
  if (minutes < 90) return { value: String(Math.round(minutes)), unit: "min" }
  const hours = minutes / 60
  return { value: hours < 10 ? hours.toFixed(1) : String(Math.round(hours)), unit: "h" }
}

/** How many times faster `b` is than `a` (rounded; ≥ 1 when b > a). */
export function speedup(a: number, b: number): number {
  if (a <= 0) return Infinity
  const r = b / a
  return r >= 10 ? Math.round(r) : Math.round(r * 10) / 10
}
