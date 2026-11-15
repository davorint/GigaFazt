/**
 * What a customer's speed test would show on a queue.
 *
 * Speed-test tools don't report a plain average. The method attributed to
 * Ookla (third-party descriptions; Ookla doesn't publish it today) splits
 * the samples into slices, drops the fastest 10 % and the slowest 30 % and
 * averages the rest. Here that is done on time-weighted rates, so a 3 s burst
 * in a 15 s test counts for 20 % of the samples. Other tools measure
 * differently, and none of this models TCP ramp-up or latency: estimates.
 */

import { simulate, type QueueParams, type SimResult } from "./burst"
import type { Pattern } from "./traffic"

/** Share of the samples dropped from the fast end and from the slow end. */
export const TRIM_FAST = 0.1
export const TRIM_SLOW = 0.3
/** Default test length, s (typical of browser speed tests). */
export const SPEEDTEST_S = 15
/** The customer runs the test again this many seconds after the first one ends. */
export const REPEAT_GAP_S = 5

export type Part = { v: number; w: number }

/** Time-weighted mean after dropping the fastest `fast` and the slowest `slow` share of the time. */
export function trimmedMean(parts: Part[], fast = TRIM_FAST, slow = TRIM_SLOW): number {
  const total = parts.reduce((a, p) => a + Math.max(0, p.w), 0)
  if (!(total > 0)) return 0
  const sorted = [...parts].filter((p) => p.w > 0).sort((a, b) => b.v - a.v)
  const lo = total * fast
  const hi = total * (1 - slow)
  let acc = 0
  let sum = 0
  let kept = 0
  for (const p of sorted) {
    const overlap = Math.max(0, Math.min(acc + p.w, hi) - Math.max(acc, lo))
    sum += p.v * overlap
    kept += overlap
    acc += p.w
  }
  return kept > 0 ? sum / kept : 0
}

/** Plain time-weighted mean. */
export function plainMean(parts: Part[]): number {
  const total = parts.reduce((a, p) => a + Math.max(0, p.w), 0)
  return total > 0 ? parts.reduce((a, p) => a + p.v * Math.max(0, p.w), 0) / total : 0
}

/** Delivered rate between t0 and t1, as time-weighted parts of each step. */
export function slice(result: SimResult, t0: number, t1: number): Part[] {
  const dt = result.stats.stepS
  const out: Part[] = []
  for (const s of result.samples) {
    const w = Math.min(s.t + dt, t1) - Math.max(s.t, t0)
    if (w > 1e-9) out.push({ v: s.rate, w })
  }
  return out
}

export type Measure = { plainMbps: number; trimmedMbps: number }

/** Speed-test reading of a stretch of a run. */
export function measure(result: SimResult, t0: number, t1: number): Measure {
  const parts = slice(result, t0, t1)
  return { plainMbps: plainMean(parts), trimmedMbps: trimmedMean(parts) }
}

export type SpeedTestEstimate = {
  testS: number
  gapS: number
  /** First test, from a rested line. */
  first: Measure
  /** Same test again `gapS` after the first one ends. */
  again: Measure
}

const TEST_PATTERN: Omit<Pattern, "onS" | "offS"> = {
  kind: "intermittent",
  demandMbps: null,
  startS: 0,
  testS: SPEEDTEST_S,
  fileMB: 0,
  videoMbps: 0,
  pageMB: 0,
}

/** A speed test from a rested line (empty burst window), then the same test again shortly after. */
export function estimateSpeedTest(
  p: QueueParams,
  opts: { testS?: number; gapS?: number; lineCapMbps?: number | null } = {}
): SpeedTestEstimate {
  const testS = opts.testS && opts.testS > 0 ? opts.testS : SPEEDTEST_S
  const gapS = opts.gapS !== undefined && opts.gapS >= 0 ? opts.gapS : REPEAT_GAP_S
  const run = simulate(p, { ...TEST_PATTERN, onS: testS, offS: gapS }, 2 * testS + gapS, { lineCapMbps: opts.lineCapMbps })
  return { testS, gapS, first: measure(run, 0, testS), again: measure(run, testS + gapS, 2 * testS + gapS) }
}
