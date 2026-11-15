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

import { isTransfer, makeSource, type Pattern, type TransferStats } from "./traffic"

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

// ── Traffic ─────────────────────────────────────────────────────────────────

export { demandAt, effectiveDemand, isTransfer, KINDS, makeSource, RATE_KINDS, TRANSFER_KINDS } from "./traffic"
export type { Pattern, PatternKind, RateKind, TransferKind, TransferStats } from "./traffic"

// ── Simulation ──────────────────────────────────────────────────────────────

export type Sample = {
  /** Start of the step, s. */
  t: number
  /** Requested rate (Infinity = saturating; transfers ask for everything until done). */
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
  /** Transfer patterns (web, video, download): completion figures. */
  transfer: TransferStats | null
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
  const source = makeSource(pattern)
  const transfer = isTransfer(pattern.kind)

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
    const want = source.want(t, dt)
    const rate = source.serve(t, dt, ceiling) / dt
    // A transfer that can use the whole ceiling reads as "everything".
    const demand = transfer && want >= ceiling - 1e-9 ? Number.POSITIVE_INFINITY : want
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
      transfer: source.stats(),
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

/** Sub-windows (burst-time ÷ 16) a burst at `burstLimit` lasts from idle with this threshold. */
export function burstSteps(burstThreshold: number, burstLimit: number): number {
  return Math.max(1, Math.ceil((WINDOWS * burstThreshold) / burstLimit - 1e-9))
}

/**
 * Longest burst from idle that doesn't keep coming back with this burst-time:
 * the threshold can go up to max-limit, no higher.
 */
export function longestSingleBurst(maxLimit: number, burstLimit: number, burstTime: number): number {
  if (!(burstLimit > maxLimit) || !(burstTime > 0)) return 0
  return (burstSteps(maxLimit, burstLimit) * burstTime) / WINDOWS
}

/**
 * RouterOS measures the burst in whole sub-windows: from idle it lasts
 * k × burst-time ÷ 16, with k = ⌈16 × threshold ÷ burst-limit⌉. So
 * burst-time = duration × 16 ÷ k for a fixed threshold, or, for a fixed
 * burst-time, k = duration × 16 ÷ burst-time and the threshold is the largest
 * value that still gives k sub-windows (whole Mbps when possible).
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
    burstTime = Math.max(1, Math.round((targetS * WINDOWS) / burstSteps(burstThreshold, burstLimit)))
  } else {
    burstTime = Math.max(1, Math.round(input.burstTime))
    const k = Math.max(1, Math.round((targetS * WINDOWS) / burstTime))
    const top = (k * burstLimit) / WINDOWS
    const floor = ((k - 1) * burstLimit) / WINDOWS
    const whole = Math.floor(top + 1e-9)
    burstThreshold = whole > floor + 1e-9 ? whole : Math.floor(top * 1000 + 1e-6) / 1000
  }
  const f = figures({ maxLimit, burstLimit, burstThreshold, burstTime, limitAt: 0 })
  return { burstThreshold, burstTime, durationS: f.durationS }
}

// ── Checks ──────────────────────────────────────────────────────────────────

export type IssueCode =
  | "burstOff"
  | "burstNone"
  | "burstLimitNotAbove"
  | "thresholdAboveMax"
  | "thresholdBelowLimitAt"
  | "limitAtAboveMax"
  | "burstAboveLineCap"
  | "maxAboveLineCap"
  | "shortBurst"
  | "neverEnds"
  | "burstAbovePlan"
  | "maxAbovePlan"

export type Issue = { code: IssueCode; level: "error" | "warn" | "info" }

export function check(
  p: QueueParams,
  opts: { lineCapMbps?: number | null; demandMbps?: number | null; planMbps?: number | null } = {}
): Issue[] {
  const out: Issue[] = []
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : null
  // The plan speed is the most a client may get (owner rule).
  const plan = opts.planMbps && opts.planMbps > 0 ? opts.planMbps : null
  if (plan !== null && p.maxLimit > plan + 1e-9) out.push({ code: "maxAbovePlan", level: "error" })
  else if (plan !== null && burstEnabled(p) && p.burstLimit > plan + 1e-9) out.push({ code: "burstAbovePlan", level: "error" })
  if (p.limitAt > p.maxLimit) out.push({ code: "limitAtAboveMax", level: "error" })
  if (p.burstLimit > 0 && p.burstLimit <= p.maxLimit) {
    out.push({ code: "burstLimitNotAbove", level: "error" })
  } else if (p.burstLimit === 0 && p.burstThreshold === 0 && p.burstTime === 0) {
    // Burst switched off on purpose (e.g. the "Sin ráfaga" rule).
    out.push({ code: "burstNone", level: "info" })
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

/**
 * How a plan speed becomes queue values. The plan speed is the most a client
 * gets (owner, 2026-11-15), so it is the burst-limit, or max-limit when there
 * is no burst. The rule sets the rest: max-limit as a share of the plan,
 * burst-threshold as a share of max-limit, and burst-time. The owner is
 * still testing which rule to use, so it is a setting, not a constant.
 */
export type PlanRule = {
  /** max-limit as a share of the plan speed. 1 = no burst (max-limit = plan). */
  sustained: number
  /** burst-threshold as a share of max-limit. */
  threshold: number
  /** burst-time, s. */
  burstTime: number
}

export const RULE_IDS = ["flat", "s80", "s50", "s20"] as const
export type RuleId = (typeof RULE_IDS)[number]

export const RULES: Record<RuleId, PlanRule> = {
  flat: { sustained: 1, threshold: 0.75, burstTime: 16 },
  s80: { sustained: 0.8, threshold: 0.75, burstTime: 16 },
  s50: { sustained: 0.5, threshold: 0.75, burstTime: 16 },
  s20: { sustained: 0.2, threshold: 0.75, burstTime: 16 },
}

/** The rule the tool starts with (the scenario the owner tested first). */
export const DEFAULT_RULE: PlanRule = RULES.s20

/** Named rule these values match, or "custom". Any rule at 100 % is "flat" (no burst). */
export function ruleId(rule: PlanRule): RuleId | "custom" {
  if (rule.sustained >= 1) return "flat"
  const id = RULE_IDS.find((k) => {
    const r = RULES[k]
    return r.sustained === rule.sustained && r.threshold === rule.threshold && r.burstTime === rule.burstTime
  })
  return id ?? "custom"
}

/** Whole Mbps from 10 Mbps up, kbps precision below (small custom plans). */
const roundRate = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 1000) / 1000)

/** Starting queue values for a plan speed under a rule. */
export function planDefaults(planMbps: number, rule: PlanRule = DEFAULT_RULE): QueueParams {
  if (rule.sustained >= 1) return { maxLimit: planMbps, burstLimit: 0, burstThreshold: 0, burstTime: 0, limitAt: 0 }
  const maxLimit = roundRate(planMbps * rule.sustained)
  return {
    maxLimit,
    burstLimit: planMbps,
    burstThreshold: roundRate(maxLimit * rule.threshold),
    burstTime: Math.max(1, Math.round(rule.burstTime)),
    limitAt: 0,
  }
}
