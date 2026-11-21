/**
 * Plans designed natively for AsterNOS-VPP (owner, 2026-11-20: "forget about the mikrotik… make the best use of the
 * capacities of asternos-vpp").
 *
 * A plan is four numbers AsterNOS can enforce per client (lib/asternos/config.ts writes them):
 * - peak: the most a client gets (HQoS user shaper);
 * - sustained: what a client keeps once the burst is used (HQoS class 1, or the policer's CIR);
 * - burst: data allowed above the sustained speed, in MB (the marker's committed bucket, CBS);
 * - recharge: how fast the burst refills, Mbps (the marker's CIR), at most the sustained speed. Slower means a client who
 *   bursts again and again gets less extra; the single-policer design ties it to sustained.
 * The marker keeps marking traffic "within burst" at the recharge rate even after the burst is used, and that traffic
 * goes to the peak class; so the over-burst class is held to sustained − recharge, and the two together give exactly the
 * sustained speed over time (review 2026-11-20: holding it to the sustained speed gave sustained + recharge).
 * Plain plan (no burst): sustained = peak, or burst 0.
 *
 * The client simulation reuses the generic traffic models in lib/mikrotik/traffic.ts (speed test, downloads, web,
 * video): they describe clients, not the MikroTik.
 */
import { makeSource, type Pattern } from "../mikrotik/traffic"

export type PlanShape = { peakMbps: number; sustainedMbps: number; burstMB: number; rechargeMbps: number }

export const hasBurst = (p: PlanShape) => p.burstMB > 0 && p.sustainedMbps < p.peakMbps

/** Seconds at peak from a full burst (the bucket drains at the peak, refills at the recharge rate). */
export function burstSeconds(p: PlanShape): number {
  if (!hasBurst(p)) return 0
  const net = p.peakMbps - Math.min(p.rechargeMbps, p.peakMbps)
  return net > 0 ? (p.burstMB * 8) / net : Infinity
}

/** Seconds to refill an empty burst while the client is idle. */
export function rechargeSeconds(p: PlanShape): number {
  if (!hasBurst(p) || p.rechargeMbps <= 0) return 0
  return (p.burstMB * 8) / p.rechargeMbps
}

/** Starting points offered in the designer (labels in the copy); the owner sets the real values. */
export const PRESETS = {
  plain: (peak: number): PlanShape => ({ peakMbps: peak, sustainedMbps: peak, burstMB: 0, rechargeMbps: peak }),
  // Half the plan sustained, the full plan for ~10 s from rest.
  short: (peak: number): PlanShape => ({ peakMbps: peak, sustainedMbps: peak / 2, burstMB: Math.round((peak / 2) * 10 / 8), rechargeMbps: peak / 2 }),
  // A fifth of the plan sustained, the full plan for ~20 s, recharging slower than the sustained speed.
  long: (peak: number): PlanShape => ({ peakMbps: peak, sustainedMbps: peak / 5, burstMB: Math.round(((peak * 4) / 5) * 20 / 8), rechargeMbps: peak / 10 }),
} as const
export type PresetId = keyof typeof PRESETS

// ── One client ─────────────────────────────────────────────────────────────

const DT = 0.05

export type ClientRun = {
  /** Rate per step, Mbps (one point per 0.5 s for charts). */
  series: { t: number; mbps: number; demand: number }[]
  totalMb: number
  /** Seconds above the sustained speed. */
  burstS: number
  transfer: ReturnType<ReturnType<typeof makeSource>["stats"]>
}

/** Two-stage AsterNOS plan (marker + HQoS): while the burst bucket lasts up to peak, then the sustained speed. */
export function simulateClient(p: PlanShape, pattern: Pattern, runS: number, lineMbps = Infinity): ClientRun {
  const src = makeSource(pattern)
  const burst = hasBurst(p)
  const size = p.burstMB * 1e6
  let c = size
  let total = 0
  let burstS = 0
  const series: ClientRun["series"] = []
  let acc = 0
  let accDemand = 0
  for (let i = 0, t = 0; t < runS - 1e-9; i++, t = i * DT) {
    if (burst) c = Math.min(size, c + (p.rechargeMbps * 1e6 * DT) / 8)
    // Within-burst traffic this step (the marker's tokens) plus the over-burst class, never above the peak.
    const green = burst ? (c * 8) / (1e6 * DT) : 0
    const over = burst ? Math.max(0, p.sustainedMbps - Math.min(p.rechargeMbps, p.sustainedMbps)) : p.sustainedMbps
    const ceiling = Math.min(lineMbps, burst ? Math.min(p.peakMbps, green + over) : p.sustainedMbps)
    const want = src.want(t, DT)
    const rate = src.serve(t, DT, ceiling) / DT
    if (burst) c = Math.max(0, c - (Math.min(rate, green) * 1e6 * DT) / 8)
    if (rate > p.sustainedMbps + 1e-9) burstS += DT
    total += rate * DT
    acc += rate * DT
    accDemand += Math.min(want, 1e6) * DT
    if ((i + 1) % 10 === 0) {
      series.push({ t: t + DT - 0.5, mbps: acc / 0.5, demand: accDemand / 0.5 })
      acc = 0
      accDemand = 0
    }
  }
  return { series, totalMb: total, burstS, transfer: src.stats() }
}

/** The client situations the designer shows. */
export const SITUATIONS: { id: string; pattern: Pattern; runS: number }[] = [
  { id: "speedtest", pattern: pat("speedtest", { testS: 15 }), runS: 20 },
  { id: "dl100", pattern: pat("download", { fileMB: 100 }), runS: 120 },
  { id: "dl1000", pattern: pat("download", { fileMB: 1000 }), runS: 600 },
  { id: "web", pattern: pat("web", { pageMB: 3 }), runS: 120 },
  { id: "video4k", pattern: pat("video", { videoMbps: 25 }), runS: 120 },
  { id: "bursts", pattern: pat("intermittent", { onS: 3, offS: 8 }), runS: 120 },
]

function pat(kind: Pattern["kind"], extra: Partial<Pattern>): Pattern {
  return { kind, demandMbps: null, startS: 0, onS: 5, offS: 25, testS: 15, fileMB: 50, videoMbps: 8, pageMB: 3, ...extra }
}
