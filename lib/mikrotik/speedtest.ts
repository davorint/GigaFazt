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

import { burstEnabled, stepSeconds, WINDOWS, type QueueParams, type SimResult } from "./burst"

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
  /** Household traffic already running (a video stream…), Mbps. */
  backgroundMbps: number
  /** First test. With no background the line starts at rest (empty burst window). */
  first: Measure
  /** Same test again `gapS` after the first one ends. */
  again: Measure
}

/**
 * A speed test, then the same test again `gapS` later, as RouterOS would
 * shape it (same sub-window logic as `simulate`). With `backgroundMbps` the
 * household already uses that much: the burst window starts in that steady
 * state and, during the test, the background keeps its rate (a video stream
 * isn't elastic) while the test gets the rest of the queue. That makes the
 * reading the low end of what a customer would see.
 */
export function estimateSpeedTest(
  p: QueueParams,
  opts: { testS?: number; gapS?: number; lineCapMbps?: number | null; backgroundMbps?: number | null } = {}
): SpeedTestEstimate {
  const testS = opts.testS && opts.testS > 0 ? opts.testS : SPEEDTEST_S
  const gapS = opts.gapS !== undefined && opts.gapS >= 0 ? opts.gapS : REPEAT_GAP_S
  const bg = opts.backgroundMbps && opts.backgroundMbps > 0 ? opts.backgroundMbps : 0
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : Number.POSITIVE_INFINITY
  const dt = stepSeconds(p)
  const canBurst = burstEnabled(p)
  const len = p.burstTime > 0 ? WINDOWS : 1
  const window = new Array<number>(len).fill(0)
  let sum = 0
  let head = 0
  const step = (demandAll: boolean) => {
    const allowed = canBurst && sum / len < p.burstThreshold
    const ceiling = Math.min(allowed ? p.burstLimit : p.maxLimit, cap)
    const background = Math.min(bg, ceiling)
    const total = demandAll ? ceiling : background
    sum += total - window[head]
    window[head] = total
    head = (head + 1) % len
    if (Math.abs(sum) < 1e-9) sum = 0
    return total - background
  }

  // Background alone long enough to reach its steady state (none: the line is at rest).
  if (bg > 0) for (let i = 0, n = Math.ceil((4 * Math.max(p.burstTime, 1)) / dt); i < n; i++) step(false)

  const first: Part[] = []
  const again: Part[] = []
  const end = 2 * testS + gapS
  for (let i = 0; i * dt < end - 1e-9; i++) {
    const t = i * dt
    // Demand is decided at the start of each sub-window, as in `simulate`.
    const testing = t < testS - 1e-9 || (t >= testS + gapS - 1e-9 && t < end - 1e-9)
    const rate = step(testing)
    const w1 = Math.min(t + dt, testS) - Math.max(t, 0)
    const w2 = Math.min(t + dt, end) - Math.max(t, testS + gapS)
    if (w1 > 1e-9) first.push({ v: rate, w: w1 })
    if (w2 > 1e-9) again.push({ v: rate, w: w2 })
  }
  const read = (parts: Part[]): Measure => ({ plainMbps: plainMean(parts), trimmedMbps: trimmedMean(parts) })
  return { testS, gapS, backgroundMbps: bg, first: read(first), again: read(again) }
}
