/**
 * MikroTik burst on AsterNOS-VPP (owner, 2026-11-20: "we need to mimic the burst of the mikrotik").
 *
 * AsterNOS has no timed burst. Its CAR policer ("car tr-tcm") is VPP's 2R3C RFC 2698 policer (VPP src/plugins/policer:
 * a committed bucket C filling at CIR up to CBS, a peak bucket P filling at PIR up to PBS, both in bytes; a packet over P
 * is violate/red, over C exceed/yellow, else conform/green; buckets capped at 2^32-1 bytes). Two designs:
 *
 * - Two-stage (default, closest): per client, a marking policer whose C bucket refills at a share of burst-threshold
 *   (the "memory" of MikroTik's burst-time average) re-marks traffic over the burst into traffic class 1, and an HQoS
 *   user shaper lets the client run up to burst-limit while class 1 is held to max-limit. Shapes, never drops on the
 *   burst decision. Needs the re-mark to reach the HQoS shaper: to verify on the device.
 * - Single policer (fallback): CIR = max-limit, PIR = burst-limit, CBS = the burst allowance, exceed and violate dropped.
 *   Same as MikroTik from idle and with long pauses; more generous when a client bursts every few seconds.
 *
 * Both are sized so a burst from idle lasts what MikroTik really gives (its 1/16 sampling lets a burst run to the next
 * sample: e.g. 3.0 s where the formula burst-threshold × burst-time ÷ burst-limit says 2.4 s). Rates Mbps, sizes bytes.
 */
import { burstEnabled, makeSource, simulate, type Pattern, type QueueParams } from "../mikrotik/burst"

export type BurstDesign = "two-stage" | "single"
export const BURST_DESIGNS: BurstDesign[] = ["two-stage", "single"]

/** Simulation step for the AsterNOS models, s. */
const DT = 0.05
/** Length of each comparison run, s. */
const RUN_S = 120
/** Peak bucket and HQoS burst sizes: ~1 MB as in Asterfusion's HQoS example ("to ensure smooth TCP performance"). */
export const SMALL_BUCKET = 1_000_000
/** VPP caps every bucket at 2^32-1 bytes (larger values are silently capped). */
export const MAX_BUCKET = 0xffffffff

const bytes = (mbps: number, s: number) => (mbps * 1e6 * s) / 8

/** How long a burst from idle really lasts on the MikroTik (sampled), s. 0 without burst. */
export function realBurstS(p: QueueParams): number {
  if (!burstEnabled(p)) return 0
  return simulate(p, pattern("sustained"), Math.max(30, p.burstTime * 3)).stats.firstBurstS
}

// ── The AsterNOS models ─────────────────────────────────────────────────────

/** Single policer: C refills at max-limit; above max-limit only while saved bytes last; peak at burst-limit. */
export function simulateSingle(p: QueueParams, cbs: number, pat: Pattern, runS = RUN_S): number {
  const src = makeSource(pat)
  let c = cbs
  let total = 0
  for (let t = 0; t < runS - 1e-9; t += DT) {
    const ceiling = Math.min(p.burstLimit, p.maxLimit + (c * 8) / (1e6 * DT))
    const rate = src.serve(t, DT, ceiling) / DT
    c = Math.min(cbs, Math.max(0, c + bytes(p.maxLimit - rate, DT)))
    total += rate * DT
  }
  return total
}

/** Two-stage: the marker's C refills at `refill`; while it can mark a step's worth, the client may use burst-limit. */
export function simulateTwoStage(p: QueueParams, size: number, refill: number, pat: Pattern, runS = RUN_S): number {
  const src = makeSource(pat)
  let c = size
  let total = 0
  for (let t = 0; t < runS - 1e-9; t += DT) {
    c = Math.min(size, c + bytes(refill, DT))
    const green = (c * 8) / (1e6 * DT)
    const ceiling = green >= p.maxLimit ? Math.min(p.burstLimit, green) : p.maxLimit
    const rate = src.serve(t, DT, ceiling) / DT
    if (green >= p.maxLimit) c = Math.max(0, c - bytes(rate, DT))
    total += rate * DT
  }
  return total
}

// ── Comparison patterns ─────────────────────────────────────────────────────

function pattern(kind: Pattern["kind"], extra: Partial<Pattern> = {}): Pattern {
  return { kind, demandMbps: null, startS: 0, onS: 5, offS: 25, testS: 15, fileMB: 50, videoMbps: 8, pageMB: 3, ...extra }
}

/** What the comparison runs: a speed test, downloads, and bursts with pauses longer and shorter than burst-time. */
export const COMPARE: { id: string; pattern: Pattern }[] = [
  { id: "speedtest", pattern: pattern("speedtest") },
  { id: "dl50", pattern: pattern("download", { fileMB: 50 }) },
  { id: "dl500", pattern: pattern("download", { fileMB: 500 }) },
  { id: "on5off25", pattern: pattern("intermittent") },
  { id: "on4off12", pattern: pattern("intermittent", { onS: 4, offS: 12 }) },
  { id: "on3off8", pattern: pattern("intermittent", { onS: 3, offS: 8 }) },
  { id: "on2off4", pattern: pattern("intermittent", { onS: 2, offS: 4 }) },
  { id: "on10off6", pattern: pattern("intermittent", { onS: 10, offS: 6 }) },
]

// ── Settings per plan ───────────────────────────────────────────────────────

export type AsterBurst = {
  burst: boolean
  /** MikroTik's real burst from idle, s. */
  burstS: number
  single: { cirMbps: number; pirMbps: number; cbs: number; pbs: number }
  twoStage: {
    /** The marker: C refills at refillMbps up to size; P = burst-limit. */
    refillMbps: number
    refillShare: number
    size: number
    pirMbps: number
    pbs: number
    /** HQoS: the client's total (burst-limit) and class 1 (max-limit). */
    userMbps: number
    overMbps: number
  }
}

/** Data the AsterNOS design delivers vs the MikroTik, per comparison pattern (+0.12 = 12 % more). */
export type Comparison = { id: string; mikrotikMb: number; singleMb: number; twoStageMb: number }[]

/** Shares of burst-threshold tried for the marker's refill; the one closest to the MikroTik wins. */
const SHARES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1]

const twoStageSize = (p: QueueParams, refill: number, burstS: number) => Math.min(MAX_BUCKET, Math.round(bytes(p.burstLimit - refill, burstS)))
const pbsFor = (mbps: number) => Math.max(SMALL_BUCKET, Math.round(bytes(mbps, 0.05)))

/** AsterNOS settings for a MikroTik queue, the marker's refill chosen by simulation (worst pattern closest to 0). */
export function asterBurst(p: QueueParams): AsterBurst {
  const burst = burstEnabled(p)
  if (!burst) {
    const plan = p.maxLimit
    return {
      burst,
      burstS: 0,
      single: { cirMbps: plan, pirMbps: plan, cbs: pbsFor(plan), pbs: pbsFor(plan) },
      twoStage: { refillMbps: plan, refillShare: 1, size: pbsFor(plan), pirMbps: plan, pbs: pbsFor(plan), userMbps: plan, overMbps: plan },
    }
  }
  const burstS = realBurstS(p)
  const mk = COMPARE.map((c) => simulate(p, c.pattern, RUN_S).stats.totalMb)
  let best = { share: 0.75, worst: Infinity }
  for (const share of SHARES) {
    const refill = p.burstThreshold * share
    if (refill >= p.maxLimit) continue
    const size = twoStageSize(p, refill, burstS)
    const worst = Math.max(...COMPARE.map((c, i) => Math.abs(simulateTwoStage(p, size, refill, c.pattern) / (mk[i] || 1) - 1)))
    if (worst < best.worst - 1e-9) best = { share, worst }
  }
  const refill = Math.round(p.burstThreshold * best.share * 1000) / 1000
  return {
    burst,
    burstS,
    single: { cirMbps: p.maxLimit, pirMbps: p.burstLimit, cbs: Math.min(MAX_BUCKET, Math.round(bytes(p.burstLimit - p.maxLimit, burstS))), pbs: pbsFor(p.burstLimit) },
    twoStage: { refillMbps: refill, refillShare: best.share, size: twoStageSize(p, refill, burstS), pirMbps: p.burstLimit, pbs: pbsFor(p.burstLimit), userMbps: p.burstLimit, overMbps: p.maxLimit },
  }
}

/** Both designs against the MikroTik for the comparison patterns. */
export function compare(p0: QueueParams, a: AsterBurst = asterBurst(p0)): Comparison {
  // Without burst the peak is the plan itself (MikroTik leaves burst-limit at 0).
  const p = a.burst ? p0 : { ...p0, burstLimit: p0.maxLimit }
  return COMPARE.map((c) => ({
    id: c.id,
    mikrotikMb: simulate(p0, c.pattern, RUN_S).stats.totalMb,
    singleMb: simulateSingle(p, a.single.cbs, c.pattern),
    twoStageMb: simulateTwoStage(p, a.twoStage.size, a.twoStage.refillMbps, c.pattern),
  }))
}

// ── Units AsterNOS asks for ─────────────────────────────────────────────────

/** CAR (traffic-behavior): cir/pir in kBps per the AsterNOS docs (1 kB = 1000 bytes assumed: to verify). */
export const carKBps = (mbps: number) => Math.round(mbps * 125)
/** HQoS and port-shaper: pir in byte/s. */
export const hqosBps = (mbps: number) => Math.round(mbps * 125_000)
