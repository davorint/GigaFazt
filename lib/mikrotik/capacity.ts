/**
 * Busiest-hour capacity: many clients under one uplink (the parent queue).
 *
 * Statistical model, not a trace:
 * - Each client alternates idle and active stretches with exponential lengths
 *   (mean active = `sessionS`), so on average `activeShare` of the clients are
 *   active at any moment. While active it asks for `demandMbps`, or for
 *   everything its queue allows (a download).
 * - Each client has its own RouterOS burst average (burst-time window
 *   sampled every step), as in `burst.ts`.
 * - The uplink is shared max-min fair among the active clients: everyone
 *   gets up to an equal share, what one doesn't use goes to the others. Same
 *   priority, no limit-at.
 * - Speed tests: for every plan, a probe client runs a test of `testS` from a
 *   rested line every `PROBE_EVERY_S`, competing with the others. Its reading
 *   (plain and Ookla-style) is what a customer of that plan would see at that
 *   hour.
 *
 * A seeded generator makes runs repeatable, so the uplink solver compares
 * like with like (same sessions at every uplink size).
 */

import { burstEnabled, stepSeconds, type QueueParams } from "./burst"
import { plainMean, trimmedMean, type Part } from "./speedtest"

export type CapacityPlan = { id: string; planMbps: number; clients: number; params: QueueParams }

export type CapacityInput = {
  parentMbps: number
  plans: CapacityPlan[]
  /** Share of clients transferring at any moment, 0..1. */
  activeShare: number
  /** Mean length of an active stretch, s. */
  sessionS: number
  /** What an active client asks for, Mbps. null = everything its queue allows. */
  demandMbps: number | null
  /** Speed test length for the probes, s. */
  testS: number
  lineCapMbps?: number | null
  /** Measured stretch after the warm-up, s. */
  durationS?: number
  seed?: number
}

export type CapacityPlanResult = {
  id: string
  planMbps: number
  clients: number
  /** Mean rate an active client of this plan gets. */
  activeAvgMbps: number
  /** Speed tests during the run: mean of the Ookla-style readings. */
  testMbps: number
  /** Mean of the plain averages (data ÷ test time). */
  testPlainMbps: number
  /** 10th percentile of the Ookla-style readings (the worst tests). */
  testP10Mbps: number
  tests: number
}

export type CapacityResult = {
  stepS: number
  durationS: number
  /** Length of each chart bucket, s (about 1 s, whole steps). */
  bucketS: number
  /** Per bucket: delivered and asked for, Mbps. */
  delivered: number[]
  asked: number[]
  parent: { avgMbps: number; p95Mbps: number; saturatedShare: number }
  plans: CapacityPlanResult[]
  clients: number
}

export const MAX_CLIENTS = 5000
export const CAPACITY_DURATION_S = 600
/** A probe test starts this often per plan. */
export const PROBE_EVERY_S = 30
/** Coarsest step the model takes (bursts with a short burst-time are sampled coarser). */
const MIN_STEP_S = 0.25

/** mulberry32: small, fast, seedable. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Max-min fair share of `parent` among `asks` (water-filling). Writes into `out`. */
export function fairShare(parent: number, asks: number[], out: number[]): void {
  let total = 0
  for (const a of asks) total += a
  if (total <= parent + 1e-9) {
    for (let i = 0; i < asks.length; i++) out[i] = asks[i]
    return
  }
  const order = asks.map((_, i) => i).sort((x, y) => asks[x] - asks[y])
  let left = Math.max(0, parent)
  for (let k = 0; k < order.length; k++) {
    const i = order[k]
    const share = left / (order.length - k)
    if (asks[i] <= share) {
      out[i] = asks[i]
      left -= asks[i]
    } else {
      for (let j = k; j < order.length; j++) out[order[j]] = share
      return
    }
  }
}

type Queue = {
  plan: number
  params: QueueParams
  canBurst: boolean
  window: Float64Array
  sum: number
  head: number
}

function makeQueue(plan: number, params: QueueParams, dt: number): Queue {
  const len = params.burstTime > 0 ? Math.max(1, Math.round(params.burstTime / dt)) : 1
  return { plan, params, canBurst: burstEnabled(params), window: new Float64Array(len), sum: 0, head: 0 }
}

function ceilingOf(q: Queue, cap: number): number {
  const allowed = q.canBurst && q.sum / q.window.length < q.params.burstThreshold
  return Math.min(allowed ? q.params.burstLimit : q.params.maxLimit, cap)
}

function push(q: Queue, rate: number) {
  q.sum += rate - q.window[q.head]
  q.window[q.head] = rate
  q.head = (q.head + 1) % q.window.length
  if (Math.abs(q.sum) < 1e-9) q.sum = 0
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function simulateCapacity(input: CapacityInput): CapacityResult {
  const plans = input.plans.map((p) => ({ ...p, clients: Math.max(0, Math.min(MAX_CLIENTS, Math.round(p.clients))) }))
  const used = plans.filter((p) => p.clients > 0)
  const dt = Math.max(MIN_STEP_S, used.length ? Math.min(...used.map((p) => stepSeconds(p.params))) : 1)
  const measured = input.durationS ?? CAPACITY_DURATION_S
  const maxBurstTime = Math.max(0, ...used.map((p) => p.params.burstTime))
  const warm = Math.max(60, 4 * input.sessionS, 2 * maxBurstTime)
  const steps = Math.ceil((warm + measured) / dt - 1e-9)
  const warmSteps = Math.ceil(warm / dt - 1e-9)
  const cap = input.lineCapMbps && input.lineCapMbps > 0 ? input.lineCapMbps : Number.POSITIVE_INFINITY
  const parent = input.parentMbps > 0 ? input.parentMbps : 0
  const share = Math.min(1, Math.max(0, input.activeShare))
  const meanOn = Math.max(dt, input.sessionS)
  const meanOff = share > 0 ? (meanOn * (1 - share)) / share : Number.POSITIVE_INFINITY
  const demand = input.demandMbps && input.demandMbps > 0 ? input.demandMbps : Number.POSITIVE_INFINITY
  const random = rng(input.seed ?? 20261115)
  const draw = (mean: number) => (Number.isFinite(mean) ? -mean * Math.log(1 - random()) : Number.POSITIVE_INFINITY)

  // Clients.
  const queues: Queue[] = []
  const active: boolean[] = []
  const left: number[] = []
  plans.forEach((p, k) => {
    for (let i = 0; i < p.clients; i++) {
      queues.push(makeQueue(k, p.params, dt))
      const on = share >= 1 || (share > 0 && random() < share)
      active.push(on)
      left.push(share >= 1 ? Number.POSITIVE_INFINITY : draw(on ? meanOn : meanOff))
    }
  })

  // One probe per plan (with clients), staggered so they don't all test at once.
  const testS = Math.max(dt, input.testS)
  const every = Math.max(PROBE_EVERY_S, 2 * testS)
  const probes = plans.map((p, k) => ({
    plan: k,
    enabled: p.clients > 0,
    queue: null as Queue | null,
    startAt: warm + (k * every) / Math.max(1, plans.length),
    parts: [] as Part[],
    trimmed: [] as number[],
    plain: [] as number[],
  }))

  const activeMb = new Array<number>(plans.length).fill(0)
  const activeS = new Array<number>(plans.length).fill(0)
  const perStep: { delivered: number; asked: number }[] = []
  const asks: number[] = []
  const owners: number[] = []
  const given: number[] = []
  const rates = new Float64Array(queues.length)
  const probeRates = new Float64Array(plans.length)

  for (let i = 0; i < steps; i++) {
    const t = i * dt
    const measuring = i >= warmSteps
    asks.length = 0
    owners.length = 0

    for (let c = 0; c < queues.length; c++) {
      left[c] -= dt
      while (left[c] <= 0) {
        active[c] = !active[c]
        left[c] += draw(active[c] ? meanOn : meanOff)
      }
      const ceiling = ceilingOf(queues[c], cap)
      const ask = active[c] ? Math.min(ceiling, demand) : 0
      if (ask > 0) {
        asks.push(ask)
        owners.push(c)
      }
    }
    for (const pr of probes) {
      if (!pr.enabled) continue
      if (!pr.queue && measuring && t >= pr.startAt - 1e-9 && t + testS <= warm + measured + 1e-9) {
        pr.queue = makeQueue(pr.plan, plans[pr.plan].params, dt)
        pr.parts = []
      }
      if (pr.queue) {
        asks.push(ceilingOf(pr.queue, cap))
        owners.push(-1 - pr.plan)
      }
    }

    given.length = asks.length
    fairShare(parent, asks, given)

    let delivered = 0
    let asked = 0
    rates.fill(0)
    probeRates.fill(0)
    for (let k = 0; k < owners.length; k++) {
      if (owners[k] >= 0) rates[owners[k]] = given[k]
      else probeRates[-1 - owners[k]] = given[k]
      delivered += given[k]
      asked += asks[k]
    }
    for (let c = 0; c < queues.length; c++) {
      const rate = rates[c]
      push(queues[c], rate)
      if (measuring && active[c]) {
        activeMb[queues[c].plan] += rate * dt
        activeS[queues[c].plan] += dt
      }
    }
    for (const pr of probes) {
      if (!pr.queue) continue
      const rate = probeRates[pr.plan]
      push(pr.queue, rate)
      pr.parts.push({ v: rate, w: dt })
      if (pr.parts.length * dt >= testS - 1e-9) {
        pr.trimmed.push(trimmedMean(pr.parts))
        pr.plain.push(plainMean(pr.parts))
        pr.queue = null
        pr.startAt = t + dt + every - testS
      }
    }
    if (measuring) perStep.push({ delivered, asked })
  }

  // Per-second buckets for the chart.
  const perBucket = Math.max(1, Math.round(1 / dt))
  const delivered: number[] = []
  const asked: number[] = []
  for (let i = 0; i < perStep.length; i += perBucket) {
    const chunk = perStep.slice(i, i + perBucket)
    delivered.push(chunk.reduce((a, s) => a + s.delivered, 0) / chunk.length)
    asked.push(chunk.reduce((a, s) => a + s.asked, 0) / chunk.length)
  }

  const loads = perStep.map((s) => s.delivered).sort((a, b) => a - b)
  const avg = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length)
  const saturated = perStep.filter((s) => s.asked > parent + 1e-6).length / Math.max(1, perStep.length)

  return {
    stepS: dt,
    durationS: measured,
    bucketS: perBucket * dt,
    delivered,
    asked,
    parent: { avgMbps: avg, p95Mbps: quantile(loads, 0.95), saturatedShare: saturated },
    plans: plans.map((p, k) => {
      const pr = probes[k]
      const sorted = [...pr.trimmed].sort((a, b) => a - b)
      return {
        id: p.id,
        planMbps: p.planMbps,
        clients: p.clients,
        activeAvgMbps: activeS[k] > 0 ? activeMb[k] / activeS[k] : 0,
        testMbps: pr.trimmed.length ? pr.trimmed.reduce((a, b) => a + b, 0) / pr.trimmed.length : 0,
        testPlainMbps: pr.plain.length ? pr.plain.reduce((a, b) => a + b, 0) / pr.plain.length : 0,
        testP10Mbps: quantile(sorted, 0.1),
        tests: pr.trimmed.length,
      }
    }),
    clients: queues.length,
  }
}

/** Lowest share of plan speed the speed tests reach, over the plans with clients. */
export function worstTestShare(r: CapacityResult): { share: number; id: string | null } {
  let share = Number.POSITIVE_INFINITY
  let id: string | null = null
  for (const p of r.plans) {
    if (p.clients <= 0 || p.tests === 0) continue
    const s = p.testMbps / p.planMbps
    if (s < share) {
      share = s
      id = p.id
    }
  }
  return { share: Number.isFinite(share) ? share : 0, id }
}

export type Sizing =
  /** Smallest uplink (rounded up) where every plan's mean speed test reaches the target. */
  | { ok: true; parentMbps: number; share: number }
  /** Not even an unlimited uplink gets there: the queue rule caps it. */
  | { ok: false; bestShare: number; id: string | null }

/** Uplink needed for the busiest-hour speed tests to reach `target` × plan speed, on average, in every plan. */
export function sizeUplink(input: Omit<CapacityInput, "parentMbps">, target: number): Sizing {
  const run = (parentMbps: number) => worstTestShare(simulateCapacity({ ...input, parentMbps }))
  const best = run(Number.POSITIVE_INFINITY)
  if (best.share + 1e-9 < target) return { ok: false, bestShare: best.share, id: best.id }

  // Above the sum of every ceiling nothing is ever trimmed: same as unlimited.
  let hi = input.plans.reduce((a, p) => a + Math.max(0, p.clients + 1) * Math.max(p.params.burstLimit, p.params.maxLimit), 0)
  let lo = 0
  for (let i = 0; i < 18 && hi - lo > Math.max(1, hi * 0.002); i++) {
    const mid = (lo + hi) / 2
    if (run(mid).share + 1e-9 >= target) hi = mid
    else lo = mid
  }
  const step = hi >= 10_000 ? 100 : hi >= 1000 ? 50 : 10
  const parentMbps = Math.ceil(hi / step) * step
  return { ok: true, parentMbps, share: run(parentMbps).share }
}
