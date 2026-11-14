/**
 * Model of RouterOS queue burst (simple queue, queue tree and PCQ share it).
 *
 * Documented behavior (MikroTik Queues manual; the 1/16 sampling and the
 * 16 s → 6 s example come from the classic Manual:Queue page):
 * - The average rate is measured over the last `burst-time` seconds and is
 *   recalculated every 1/16 of `burst-time`.
 * - While that average is below `burst-threshold` the queue may run up to
 *   `burst-limit`; once the average reaches the threshold it is held to
 *   `max-limit`.
 * - `burst-time` is the averaging window, not how long the burst lasts.
 *
 * All rates are in Mbps, times in seconds. Pure functions, no I/O.
 */

export type QueueParams = {
  maxLimit: number
  burstLimit: number
  burstThreshold: number
  burstTime: number
  /** Guaranteed rate (CIR). Only matters when a parent queue is congested. */
  limitAt: number
}

/** Number of sub-windows RouterOS keeps per `burst-time`. */
export const WINDOWS = 16

/** Burst only does anything with all three burst values set and burst-limit above max-limit. */
export function burstEnabled(p: QueueParams): boolean {
  return p.burstTime > 0 && p.burstThreshold > 0 && p.burstLimit > p.maxLimit
}

/** Simulation step: one RouterOS sub-window (burst-time / 16), or 0.5 s with burst off. */
export function stepSeconds(p: QueueParams): number {
  return p.burstTime > 0 ? p.burstTime / WINDOWS : 0.5
}

// ── Traffic patterns ────────────────────────────────────────────────────────

export type PatternKind = "sustained" | "intermittent" | "speedtest"

export type Pattern = {
  kind: PatternKind
  /** What the client asks for while active, Mbps. null = as much as it gets. */
  demandMbps: number | null
  /** Idle seconds before the traffic starts. */
  startS: number
  /** intermittent: seconds on / seconds off. */
  onS: number
  offS: number
  /** speedtest: test length. */
  testS: number
}

/** Demand at time t (Mbps). `Infinity` = saturating. */
export function demandAt(pattern: Pattern, t: number): number {
  const rate = pattern.demandMbps ?? Number.POSITIVE_INFINITY
  const local = t - pattern.startS
  if (local < 0) return 0
  switch (pattern.kind) {
    case "sustained":
      return rate
    case "speedtest":
      return local < pattern.testS ? rate : 0
    case "intermittent": {
      const period = pattern.onS + pattern.offS
      if (pattern.onS <= 0) return 0
      if (period <= 0) return rate
      return local % period < pattern.onS ? rate : 0
    }
  }
}

// ── Simulation ──────────────────────────────────────────────────────────────

export type Sample = {
  /** Start of the step, s. */
  t: number
  /** Requested rate (Infinity = saturating). */
  demand: number
  /** Average over the last burst-time at the start of the step (what RouterOS compares). */
  avg: number
  /** Rate the queue allows during the step. */
  ceiling: number
  /** Rate actually delivered. */
  rate: number
  /** The average was below the threshold, so the ceiling was burst-limit. */
  burstAllowed: boolean
  /** Delivered above max-limit (the client is actually using the burst). */
  inBurst: boolean
}

export type SimStats = {
  stepS: number
  durationS: number
  /** Megabits delivered. */
  totalMb: number
  /** Mean rate over the whole run. */
  avgMbps: number
  /** Mean rate over the steps where the client asked for traffic. */
  activeAvgMbps: number
  activeS: number
  /** Seconds delivered above max-limit. */
  burstS: number
  /** Separate stretches above max-limit. */
  burstCount: number
  /** Length of the first stretch above max-limit (0 if none). */
  firstBurstS: number
  peakMbps: number
}

export type SimResult = { samples: Sample[]; stats: SimStats }

export type SimOptions = {
  /** Physical access cap (ONT port, PON share…), Mbps. */
  lineCapMbps?: number | null
  /** Treat burst as off (baseline for "what burst adds"). */
  noBurst?: boolean
}

export function simulate(p: QueueParams, pattern: Pattern, durationS: number, opts: SimOptions = {}): SimResult {
  const dt = stepSeconds(p)
  const steps = Math.max(1, Math.ceil(durationS / dt - 1e-9))
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : Number.POSITIVE_INFINITY
  const canBurst = !opts.noBurst && burstEnabled(p)
  const windowLen = p.burstTime > 0 ? WINDOWS : 1
  const window = new Array<number>(windowLen).fill(0)
  let sum = 0
  let head = 0

  const samples: Sample[] = []
  let totalMb = 0
  let activeMb = 0
  let activeS = 0
  let burstS = 0
  let burstCount = 0
  let firstBurstS = 0
  let firstBurstDone = false
  let prevInBurst = false
  let peak = 0

  for (let i = 0; i < steps; i++) {
    const t = i * dt
    const avg = sum / windowLen
    const burstAllowed = canBurst && avg < p.burstThreshold
    const ceiling = Math.min(burstAllowed ? p.burstLimit : p.maxLimit, cap)
    const demand = demandAt(pattern, t)
    const rate = Math.max(0, Math.min(demand, ceiling))
    const inBurst = rate > p.maxLimit + 1e-9

    samples.push({ t, demand, avg, ceiling, rate, burstAllowed, inBurst })

    // Slide the window: drop the oldest sub-window, add this one.
    sum += rate - window[head]
    window[head] = rate
    head = (head + 1) % windowLen
    if (Math.abs(sum) < 1e-9) sum = 0

    totalMb += rate * dt
    if (demand > 0) {
      activeMb += rate * dt
      activeS += dt
    }
    if (inBurst) {
      burstS += dt
      if (!prevInBurst) burstCount++
      if (!firstBurstDone) firstBurstS += dt
    } else if (prevInBurst) {
      firstBurstDone = true
    }
    prevInBurst = inBurst
    peak = Math.max(peak, rate)
  }

  const runS = steps * dt
  return {
    samples,
    stats: {
      stepS: dt,
      durationS: runS,
      totalMb,
      avgMbps: totalMb / runS,
      activeAvgMbps: activeS > 0 ? activeMb / activeS : 0,
      activeS,
      burstS,
      burstCount,
      firstBurstS,
      peakMbps: peak,
    },
  }
}

// ── Closed-form figures ─────────────────────────────────────────────────────

export type BurstFigures = {
  enabled: boolean
  stepS: number
  /** Rate reached during the burst: min(burst-limit, demand, line cap). */
  burstRate: number
  /**
   * Burst length from an idle line at `burstRate`, s (whole sub-windows, as
   * RouterOS measures it). Infinity when the burst rate never pushes the
   * average to the threshold; 0 when the burst can't go above max-limit.
   */
  durationS: number
  /** Continuous approximation: threshold × burst-time / burst rate. */
  approxS: number
  /** Megabytes delivered above max-limit during that first burst. */
  extraMB: number
  /** Idle time after which the full burst is available again (= burst-time). */
  rechargeS: number
  /**
   * Long-run rate under saturating traffic: max-limit, or ≈ threshold when
   * the threshold is above max-limit (the burst keeps coming back).
   */
  sustainedMbps: number
  /** The burst repeats forever under saturating traffic (threshold > max-limit). */
  repeats: boolean
}

export function figures(p: QueueParams, opts: { demandMbps?: number | null; lineCapMbps?: number | null } = {}): BurstFigures {
  const stepS = stepSeconds(p)
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : Number.POSITIVE_INFINITY
  const demand = opts.demandMbps && opts.demandMbps > 0 ? opts.demandMbps : Number.POSITIVE_INFINITY
  const enabled = burstEnabled(p)
  const burstRate = Math.min(enabled ? p.burstLimit : p.maxLimit, demand, cap)
  const repeats = enabled && p.burstThreshold > p.maxLimit && Math.min(demand, cap) > p.maxLimit
  const sustainedMbps = Math.min(repeats ? p.burstThreshold : p.maxLimit, demand, cap)

  if (!enabled || burstRate <= p.maxLimit) {
    return { enabled, stepS, burstRate, durationS: 0, approxS: 0, extraMB: 0, rechargeS: p.burstTime, sustainedMbps, repeats }
  }
  if (burstRate < p.burstThreshold) {
    return {
      enabled,
      stepS,
      burstRate,
      durationS: Number.POSITIVE_INFINITY,
      approxS: Number.POSITIVE_INFINITY,
      extraMB: Number.POSITIVE_INFINITY,
      rechargeS: p.burstTime,
      sustainedMbps: burstRate,
      repeats: false,
    }
  }
  // After k full steps from idle the average is k·rate/16; the burst holds
  // while k·rate/16 < threshold.
  const steps = Math.ceil((WINDOWS * p.burstThreshold) / burstRate - 1e-9)
  const durationS = steps * stepS
  return {
    enabled,
    stepS,
    burstRate,
    durationS,
    approxS: (p.burstThreshold * p.burstTime) / burstRate,
    extraMB: ((burstRate - p.maxLimit) * durationS) / 8,
    rechargeS: p.burstTime,
    sustainedMbps,
    repeats,
  }
}

// ── Solver ──────────────────────────────────────────────────────────────────

export type SolveInput = {
  maxLimit: number
  burstLimit: number
  /** How long the burst should last from an idle line, s. */
  targetS: number
} & ({ solveFor: "burstTime"; burstThreshold: number } | { solveFor: "burstThreshold"; burstTime: number })

export type SolveResult = {
  burstThreshold: number
  /** Whole seconds (RouterOS writes burst-time in seconds). */
  burstTime: number
  /** What those rounded values really give (whole sub-windows). */
  durationS: number
}

/**
 * duration ≈ threshold × burst-time / burst-limit, so
 * burst-time = duration × burst-limit / threshold, or
 * threshold = duration × burst-limit / burst-time.
 * burst-time is rounded to whole seconds and the threshold to whole Mbps;
 * `durationS` reports the real result after rounding. null when the inputs
 * can't produce a burst.
 */
export function solve(input: SolveInput): SolveResult | null {
  const { maxLimit, burstLimit, targetS } = input
  if (!(maxLimit > 0) || !(burstLimit > maxLimit) || !(targetS > 0)) return null
  let burstThreshold: number
  let burstTime: number
  if (input.solveFor === "burstTime") {
    burstThreshold = input.burstThreshold
    if (!(burstThreshold > 0)) return null
    burstTime = Math.max(1, Math.round((targetS * burstLimit) / burstThreshold))
  } else {
    burstTime = Math.max(1, Math.round(input.burstTime))
    burstThreshold = Math.max(1, Math.round((targetS * burstLimit) / burstTime))
  }
  const f = figures({ maxLimit, burstLimit, burstThreshold, burstTime, limitAt: 0 })
  return { burstThreshold, burstTime, durationS: f.durationS }
}

// ── Checks ──────────────────────────────────────────────────────────────────

export type IssueCode =
  | "burstOff"
  | "burstLimitNotAbove"
  | "thresholdAboveMax"
  | "thresholdBelowLimitAt"
  | "limitAtAboveMax"
  | "burstAboveLineCap"
  | "maxAboveLineCap"
  | "shortBurst"
  | "neverEnds"

export type Issue = { code: IssueCode; level: "error" | "warn" | "info" }

export function check(p: QueueParams, opts: { lineCapMbps?: number | null; demandMbps?: number | null } = {}): Issue[] {
  const out: Issue[] = []
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : null
  if (p.limitAt > p.maxLimit) out.push({ code: "limitAtAboveMax", level: "error" })
  if (p.burstLimit > 0 && p.burstLimit <= p.maxLimit) {
    out.push({ code: "burstLimitNotAbove", level: "error" })
  } else if (!burstEnabled(p)) {
    out.push({ code: "burstOff", level: "info" })
  }
  if (burstEnabled(p)) {
    if (p.burstThreshold > p.maxLimit) out.push({ code: "thresholdAboveMax", level: "warn" })
    if (p.limitAt > 0 && p.burstThreshold < p.limitAt) out.push({ code: "thresholdBelowLimitAt", level: "warn" })
    if (cap !== null && p.burstLimit > cap) out.push({ code: "burstAboveLineCap", level: "warn" })
    const f = figures(p, opts)
    if (f.durationS === Number.POSITIVE_INFINITY) out.push({ code: "neverEnds", level: "warn" })
    else if (f.durationS > 0 && f.durationS < 1) out.push({ code: "shortBurst", level: "info" })
  }
  if (cap !== null && p.maxLimit > cap) out.push({ code: "maxAboveLineCap", level: "warn" })
  return out
}

/** Starting burst values for a plan speed: 2× burst, threshold at 3/4, 16 s window (6 s burst). */
export function defaultsFor(maxLimit: number): QueueParams {
  return {
    maxLimit,
    burstLimit: maxLimit * 2,
    burstThreshold: Math.round(maxLimit * 0.75),
    burstTime: 16,
    limitAt: 0,
  }
}
