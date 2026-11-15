/**
 * Busiest-hour capacity: many clients behind PON ports and one uplink.
 *
 * Statistical model, calibrated to an average per client:
 * - `avgMbps` is what one client moves on average at the busiest hour
 *   (OpenVault 1Q25: 1.544 GB/h per residential subscriber at 9 PM ≈ 3.4 Mbps
 *   down, 0.096 GB/h ≈ 0.21 Mbps up). Editable: it's the main input.
 * - Part of it (`videoShare`, download only) is video: a client streams at
 *   `videoMbps` for the whole run with the probability that gives that
 *   average. A stream isn't elastic: it keeps its rate if the queue allows.
 * - The rest are downloads of random size (exponential, mean `fileMB`),
 *   arriving at random (Poisson) at the rate that gives the average. A
 *   download takes everything its queue allows, so a faster plan finishes
 *   the same file sooner instead of moving more data.
 * - Each client has its own RouterOS burst average, as in `burst.ts`.
 * - Sharing is max-min fair at each bottleneck in turn: every PON port (its
 *   line rate × an efficiency for GEM framing/FEC), then every OLT's uplink
 *   (ports grouped per OLT), then the internet uplink. Passes in order are an
 *   approximation of the real chain. Same priority, no limit-at.
 * - Speed tests: for every plan, a probe client in a different port each
 *   time runs a test of `testS` from a rested line every `PROBE_EVERY_S`,
 *   competing with the others. Its reading is what a customer of that plan
 *   would see at that hour.
 *
 * A seeded generator makes runs repeatable, so the solvers compare like with
 * like (the same sessions at every uplink size).
 */

import { burstEnabled, stepSeconds, type QueueParams } from "./burst"
import { plainMean, trimmedMean, type Part } from "./speedtest"

export type PonTech = "none" | "gpon" | "xgpon" | "xgspon"
/** Nominal line rates, Mbps (ITU-T G.984 GPON, G.987 XG-PON, G.9807.1 XGS-PON). */
export const PON_RATES: Record<Exclude<PonTech, "none">, { down: number; up: number }> = {
  gpon: { down: 2488.32, up: 1244.16 },
  xgpon: { down: 9953.28, up: 2488.32 },
  xgspon: { down: 9953.28, up: 9953.28 },
}
/**
 * Share of the line rate left for Ethernet traffic after GEM framing and FEC.
 * An assumption: published estimates range from ~92 % (Lightwave's GPON
 * model) to 95–96 % (4–5 % GEM overhead); the lower one is the safe side.
 */
export const DEFAULT_PON_EFFICIENCY = 0.92
/** Most ONTs per PON port on Huawei GPON boards (1:128 split). */
export const MAX_HOMES_PER_PORT = 128

export type PonConfig = { tech: PonTech; homesPerPort: number; efficiency?: number }
/** OLTs: how many PON ports each one has and its uplink to the router. */
export type OltConfig = { portsPerOlt: number; uplinkMbps: number }

export type Direction = "down" | "up"

export type CapacityPlan = { id: string; planMbps: number; clients: number; params: QueueParams }

export type CapacityInput = {
  /** Uplink (parent queue) max-limit, Mbps. Infinity = unlimited. */
  parentMbps: number
  plans: CapacityPlan[]
  direction: Direction
  /** Busy-hour average per client in this direction, Mbps. */
  avgMbps: number
  /** Share of that average that is video, 0..1 (download only). */
  videoShare: number
  /** Bitrate of one stream, Mbps. */
  videoMbps: number
  /** Mean size of the other downloads, MB. */
  fileMB: number
  pon: PonConfig
  /** null/absent = no OLT limit (one big switch). */
  olt?: OltConfig | null
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
  /** Downloads finished in the run: data ÷ time, Mbps. */
  transferMbps: number
  transfers: number
  /** Speed tests during the run (probes that don't load the network): mean of the Ookla-style readings. */
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
  /** Per bucket: uplink load and the busiest PON port's load, Mbps. */
  delivered: number[]
  busiestPort: number[]
  /** Per bucket: the clients asked for more than the uplink has for at least half of it. */
  saturated: boolean[]
  parent: { avgMbps: number; p95Mbps: number; saturatedShare: number }
  /** null without a PON layer. */
  ports: { count: number; capacityMbps: number; p95Mbps: number; saturatedShare: number } | null
  /** null without an OLT limit. */
  olts: { count: number; portsPerOlt: number; uplinkMbps: number; p95Mbps: number; saturatedShare: number } | null
  /** Average load the inputs ask for (clients × average), Mbps; above the uplink it can't keep up. */
  offeredMbps: number
  /** Same for one full PON port. null without a PON layer. */
  offeredPerPortMbps: number | null
  /** Same for one full OLT. null without an OLT limit. */
  offeredPerOltMbps: number | null
  /** Share of streaming time a stream got less than its bitrate. null without video. */
  videoShortShare: number | null
  /** Mean delivered per client, Mbps (what the run actually moved; compare with avgMbps). */
  perClientMbps: number
  plans: CapacityPlanResult[]
  clients: number
}

export const MAX_CLIENTS = 6000
export const CAPACITY_DURATION_S = 600
/** A probe test starts this often per plan (probes don't load the network, so they can overlap). */
export const PROBE_EVERY_S = 5
/** Coarsest step the model takes (bursts with a short burst-time are sampled coarser). */
const MIN_STEP_S = 0.25
const EPS = 1e-9

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

let scratch = new Float64Array(64)

/**
 * Max-min fair share of `parent` among `asks` (water-filling): everyone gets
 * min(ask, L), with the level L that uses exactly `parent`. Writes into `out`.
 */
export function fairShare(parent: number, asks: ArrayLike<number>, out: number[]): void {
  const n = asks.length
  let total = 0
  for (let i = 0; i < n; i++) total += asks[i]
  if (total <= parent + EPS) {
    for (let i = 0; i < n; i++) out[i] = asks[i]
    return
  }
  if (scratch.length < n) scratch = new Float64Array(Math.max(n, scratch.length * 2))
  for (let i = 0; i < n; i++) scratch[i] = asks[i]
  const sorted = scratch.subarray(0, n).sort()
  let left = Math.max(0, parent)
  let level = 0
  for (let k = 0; k < n; k++) {
    const share = left / (n - k)
    if (sorted[k] <= share) left -= sorted[k]
    else {
      level = share
      break
    }
  }
  for (let i = 0; i < n; i++) out[i] = Math.min(asks[i], level)
}

type Window = { win: Float64Array; sum: number; head: number }

function makeWindow(params: QueueParams, dt: number): Window {
  const len = params.burstTime > 0 ? Math.max(1, Math.round(params.burstTime / dt)) : 1
  return { win: new Float64Array(len), sum: 0, head: 0 }
}

function ceilingOf(params: QueueParams, w: Window, cap: number): number {
  const allowed = burstEnabled(params) && w.sum / w.win.length < params.burstThreshold
  return Math.min(allowed ? params.burstLimit : params.maxLimit, cap)
}

function push(w: Window, rate: number) {
  w.sum += rate - w.win[w.head]
  w.win[w.head] = rate
  w.head = (w.head + 1) % w.win.length
  if (Math.abs(w.sum) < EPS) w.sum = 0
}

function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Usable port capacity for the input's PON layer and direction (Infinity without one). */
export function portCapacity(input: Pick<CapacityInput, "pon" | "direction">): number {
  if (input.pon.tech === "none") return Number.POSITIVE_INFINITY
  const eff = input.pon.efficiency && input.pon.efficiency > 0 ? Math.min(1, input.pon.efficiency) : DEFAULT_PON_EFFICIENCY
  return PON_RATES[input.pon.tech][input.direction] * eff
}

const oltOn = (olt: OltConfig | null | undefined): olt is OltConfig => !!olt && olt.portsPerOlt > 0 && olt.uplinkMbps > 0

/**
 * Share a newcomer asking `extra` would get from `capacity` already shared
 * max-min fair by `sorted` (ascending) asks, with `prefix[i]` = sum of the
 * first i. The newcomer doesn't change what the others get here: the probes
 * read the network without loading it.
 */
function shareOfNewcomer(sorted: Float64Array, prefix: Float64Array, n: number, capacity: number, extra: number): number {
  const total = prefix[n] + extra
  if (total <= capacity + EPS) return extra
  // Level L with Σ min(a, L) + min(extra, L) = capacity (monotone in L).
  let lo = 0
  let hi = Math.max(extra, n > 0 ? sorted[n - 1] : 0)
  for (let it = 0; it < 48; it++) {
    const mid = (lo + hi) / 2
    // k = number of asks below mid.
    let a = 0
    let b = n
    while (a < b) {
      const m = (a + b) >> 1
      if (sorted[m] < mid) a = m + 1
      else b = m
    }
    const used = prefix[a] + (n - a) * mid + Math.min(extra, mid)
    if (used > capacity) hi = mid
    else lo = mid
  }
  return Math.min(extra, lo)
}

/** Sorted copy and prefix sums of `values[idx]` for `shareOfNewcomer`. */
function sortedWithPrefix(values: Float64Array, idx: number[], sorted: Float64Array, prefix: Float64Array): number {
  const n = idx.length
  for (let k = 0; k < n; k++) sorted[k] = values[idx[k]]
  sorted.subarray(0, n).sort()
  prefix[0] = 0
  for (let k = 0; k < n; k++) prefix[k + 1] = prefix[k] + sorted[k]
  return n
}

type Job = { left: number; size: number; start: number }
type Probe = { plan: number; port: number; w: Window; parts: Part[]; end: number }

export function simulateCapacity(input: CapacityInput): CapacityResult {
  const plans = input.plans.map((p) => ({ ...p, clients: Math.max(0, Math.min(MAX_CLIENTS, Math.round(p.clients))) }))
  const used = plans.filter((p) => p.clients > 0)
  const dt = Math.max(MIN_STEP_S, used.length ? Math.min(...used.map((p) => stepSeconds(p.params))) : 1)
  const measured = input.durationS ?? CAPACITY_DURATION_S
  const maxBurstTime = Math.max(0, ...used.map((p) => p.params.burstTime))
  const warm = Math.max(60, 2 * maxBurstTime)
  const steps = Math.ceil((warm + measured) / dt - EPS)
  const warmSteps = Math.ceil(warm / dt - EPS)
  const cap = input.lineCapMbps && input.lineCapMbps > 0 ? input.lineCapMbps : Number.POSITIVE_INFINITY
  const parent = input.parentMbps > 0 ? input.parentMbps : 0
  const random = rng(input.seed ?? 20261115)
  const exp = (mean: number) => -mean * Math.log(1 - random())

  // Traffic per client: streams + downloads that average `avg`.
  const avg = Math.max(0, input.avgMbps)
  const videoMbps = Math.max(0, input.videoMbps)
  const videoShare = input.direction === "down" && videoMbps > 0 ? Math.min(1, Math.max(0, input.videoShare)) : 0
  const streamChance = videoShare > 0 ? Math.min(1, (avg * videoShare) / videoMbps) : 0
  const fileMb = Math.max(0.001, input.fileMB) * 8
  const transferRate = Math.max(0, avg - streamChance * videoMbps) / fileMb
  const gap = transferRate > 0 ? 1 / transferRate : Number.POSITIVE_INFINITY

  // Clients, spread over the PON ports round-robin so every port mixes plans.
  const total = used.reduce((a, p) => a + p.clients, 0)
  const homes = Math.max(1, Math.round(input.pon.homesPerPort))
  const pon = input.pon.tech !== "none"
  const portCount = pon ? Math.max(1, Math.ceil(total / homes)) : 1
  const portCap = portCapacity(input)
  const olt = oltOn(input.olt) ? input.olt : null
  const portsPerOlt = olt ? Math.max(1, Math.round(olt.portsPerOlt)) : portCount
  const oltCount = Math.max(1, Math.ceil(portCount / portsPerOlt))
  const oltCap = olt ? olt.uplinkMbps : Number.POSITIVE_INFINITY
  const oltOfPort = (p: number) => Math.min(oltCount - 1, Math.floor(p / portsPerOlt))

  const N = total
  const planOf = new Int32Array(N)
  const portOf = new Int32Array(N)
  const stream = new Uint8Array(N)
  const windows: Window[] = new Array(N)
  const lastStep = new Int32Array(N).fill(-1)
  const nextAt = new Float64Array(N)
  const jobs: Job[][] = new Array(N)
  const buckets: number[][] = Array.from({ length: steps }, () => [])
  const busy = new Uint8Array(N)
  let activeList: number[] = []
  {
    let i = 0
    plans.forEach((p, k) => {
      for (let c = 0; c < p.clients; c++, i++) {
        planOf[i] = k
        portOf[i] = i % portCount
        stream[i] = random() < streamChance ? 1 : 0
        windows[i] = makeWindow(p.params, dt)
        jobs[i] = []
        nextAt[i] = exp(gap)
        const b = Math.floor(nextAt[i] / dt)
        if (b < steps) buckets[b].push(i)
        if (stream[i]) {
          busy[i] = 1
          activeList.push(i)
        }
      }
    })
  }

  /** Zeros for the steps a client sat idle (its window decays as RouterOS's would). */
  const catchUp = (i: number, s: number) => {
    const w = windows[i]
    const idle = s - lastStep[i] - 1
    if (lastStep[i] < 0 || idle <= 0) return
    if (idle >= w.win.length) {
      w.win.fill(0)
      w.sum = 0
      w.head = 0
    } else for (let k = 0; k < idle; k++) push(w, 0)
  }

  // Probes: a new speed test per plan every PROBE_EVERY_S, staggered, each in another port.
  const testS = Math.max(dt, input.testS)
  const probes: Probe[] = []
  const nextProbe = plans.map((_, k) => warm + (k * PROBE_EVERY_S) / Math.max(1, plans.length))
  const probeCount = plans.map(() => 0)
  const trimmed: number[][] = plans.map(() => [])
  const plain: number[][] = plans.map(() => [])

  const transferMb = new Array<number>(plans.length).fill(0)
  const transferS = new Array<number>(plans.length).fill(0)
  const transferCount = new Array<number>(plans.length).fill(0)
  let streamSteps = 0
  let shortSteps = 0
  let movedMb = 0

  const perStepLoad: number[] = []
  const perStepPort: number[] = []
  const perStepSat: boolean[] = []
  const portLoads: number[] = []
  let portSatSteps = 0
  const oltLoads: number[] = []
  let oltSatSteps = 0

  // Scratch.
  const ask = new Float64Array(N)
  const videoAsk = new Float64Array(N)
  const given = new Float64Array(N)
  const passed = new Float64Array(N)
  const passed2 = new Float64Array(N)
  const portMembers: number[][] = Array.from({ length: portCount }, () => [])
  const oltMembers: number[][] = Array.from({ length: oltCount }, () => [])
  const oltWant = new Float64Array(oltCount)
  const oltLoad = new Float64Array(oltCount)
  const portWant = new Float64Array(portCount)
  const portLoad = new Float64Array(portCount)
  const buf: number[] = []
  const out: number[] = []
  const sorted = new Float64Array(N + 1)
  const prefix = new Float64Array(N + 2)

  for (let s = 0; s < steps; s++) {
    const t = s * dt
    const measuring = s >= warmSteps

    // New downloads this step.
    for (const i of buckets[s]) {
      while (nextAt[i] < t + dt - EPS) {
        const size = exp(fileMb)
        jobs[i].push({ left: size, size, start: nextAt[i] })
        nextAt[i] += exp(gap)
      }
      const b = Math.floor(nextAt[i] / dt)
      if (b < steps) buckets[b].push(i)
      if (!busy[i]) {
        busy[i] = 1
        activeList.push(i)
      }
    }
    buckets[s] = []

    // What each busy client asks for.
    for (const m of portMembers) m.length = 0
    portWant.fill(0)
    for (const i of activeList) {
      catchUp(i, s)
      const ceiling = ceilingOf(plans[planOf[i]].params, windows[i], cap)
      const v = stream[i] ? Math.min(videoMbps, ceiling) : 0
      videoAsk[i] = v
      ask[i] = jobs[i].length > 0 ? ceiling : v
      if (ask[i] > 0) {
        portMembers[portOf[i]].push(i)
        portWant[portOf[i]] += ask[i]
      }
    }

    // Pass 1: each PON port shares its usable rate. Pass 2: each OLT's uplink shares what its
    // ports let through. Pass 3: the internet uplink shares what the OLTs let through.
    const allActive: number[] = []
    for (const m of oltMembers) m.length = 0
    oltWant.fill(0)
    for (let p = 0; p < portCount; p++) {
      const members = portMembers[p]
      if (members.length === 0) continue
      buf.length = members.length
      out.length = members.length
      for (let k = 0; k < members.length; k++) buf[k] = ask[members[k]]
      fairShare(portCap, buf, out)
      const o = oltOfPort(p)
      for (let k = 0; k < members.length; k++) {
        passed[members[k]] = out[k]
        oltMembers[o].push(members[k])
        oltWant[o] += out[k]
        allActive.push(members[k])
      }
      if (measuring && pon && portWant[p] > portCap + 1e-6) portSatSteps++
    }
    for (let o = 0; o < oltCount; o++) {
      const members = oltMembers[o]
      if (members.length === 0) continue
      buf.length = members.length
      out.length = members.length
      for (let k = 0; k < members.length; k++) buf[k] = passed[members[k]]
      fairShare(oltCap, buf, out)
      for (let k = 0; k < members.length; k++) passed2[members[k]] = out[k]
      if (measuring && olt && oltWant[o] > oltCap + 1e-6) oltSatSteps++
    }
    buf.length = allActive.length
    out.length = allActive.length
    // The uplink only sees what got past the ports and OLTs.
    let reaching = 0
    for (let k = 0; k < allActive.length; k++) {
      buf[k] = passed2[allActive[k]]
      reaching += buf[k]
    }
    fairShare(parent, buf, out)
    for (let k = 0; k < allActive.length; k++) given[allActive[k]] = out[k]

    // Deliver: video first, the rest to the client's downloads in order of arrival.
    let delivered = 0
    portLoad.fill(0)
    oltLoad.fill(0)
    const stillBusy: number[] = []
    for (const i of activeList) {
      const rate = ask[i] > 0 ? given[i] : 0
      const v = Math.min(videoAsk[i], rate)
      if (measuring && stream[i]) {
        streamSteps++
        if (v < videoMbps - 1e-6) shortSteps++
      }
      const elastic = rate - v
      let sentMb = v * dt
      const q = jobs[i]
      let now = t
      while (elastic > EPS && q.length > 0) {
        const job = q[0]
        if (job.start > now) now = job.start
        if (now >= t + dt - EPS) break
        const room = elastic * (t + dt - now)
        if (job.left <= room + EPS) {
          now += job.left / elastic
          sentMb += job.left
          q.shift()
          if (measuring && job.start >= warm) {
            transferMb[planOf[i]] += job.size
            transferS[planOf[i]] += Math.max(now - job.start, EPS)
            transferCount[planOf[i]]++
          }
        } else {
          job.left -= room
          sentMb += room
          now = t + dt
        }
      }
      const sent = sentMb / dt
      push(windows[i], sent)
      lastStep[i] = s
      delivered += sent
      portLoad[portOf[i]] += sent
      oltLoad[oltOfPort(portOf[i])] += sent
      if (measuring) movedMb += sentMb
      given[i] = 0
      if (stream[i] || q.length > 0) stillBusy.push(i)
      else busy[i] = 0
    }
    activeList = stillBusy

    // Probes read what a test would get now, without loading the network.
    if (measuring) {
      for (let k = 0; k < plans.length; k++) {
        while (plans[k].clients > 0 && t >= nextProbe[k] - EPS && t + testS <= warm + measured + EPS) {
          probes.push({
            plan: k,
            port: (k + probeCount[k] * 7) % portCount,
            w: makeWindow(plans[k].params, dt),
            parts: [],
            end: t + testS,
          })
          probeCount[k]++
          nextProbe[k] += PROBE_EVERY_S
        }
      }
    }
    if (probes.length > 0) {
      let nUp = -1
      const portSorted = new Map<number, { s: Float64Array; p: Float64Array; n: number }>()
      const oltSorted = new Map<number, { s: Float64Array; p: Float64Array; n: number }>()
      for (let k = probes.length - 1; k >= 0; k--) {
        const pr = probes[k]
        const want = ceilingOf(plans[pr.plan].params, pr.w, cap)
        let ps = portSorted.get(pr.port)
        if (!ps && pon) {
          const members = portMembers[pr.port]
          const s1 = new Float64Array(members.length)
          const p1 = new Float64Array(members.length + 1)
          const n1 = sortedWithPrefix(ask, members, s1, p1)
          ps = { s: s1, p: p1, n: n1 }
          portSorted.set(pr.port, ps)
        }
        const x = pon && ps ? shareOfNewcomer(ps.s, ps.p, ps.n, portCap, want) : want
        // Then its OLT's uplink, then the internet uplink.
        let z = x
        const o = oltOfPort(pr.port)
        if (olt && oltWant[o] + x > oltCap + EPS) {
          let os = oltSorted.get(o)
          if (!os) {
            const members = oltMembers[o]
            const s2 = new Float64Array(members.length)
            const p2 = new Float64Array(members.length + 1)
            os = { s: s2, p: p2, n: sortedWithPrefix(passed, members, s2, p2) }
            oltSorted.set(o, os)
          }
          z = shareOfNewcomer(os.s, os.p, os.n, oltCap, x)
        }
        let y = z
        if (reaching + z > parent + EPS) {
          if (nUp < 0) nUp = sortedWithPrefix(passed2, allActive, sorted, prefix)
          y = shareOfNewcomer(sorted, prefix, nUp, parent, z)
        }
        push(pr.w, y)
        pr.parts.push({ v: y, w: dt })
        if (t + dt >= pr.end - EPS) {
          trimmed[pr.plan].push(trimmedMean(pr.parts))
          plain[pr.plan].push(plainMean(pr.parts))
          probes.splice(k, 1)
        }
      }
    }

    if (measuring) {
      let busiest = 0
      for (let p = 0; p < portCount; p++) {
        busiest = Math.max(busiest, portLoad[p])
        if (pon) portLoads.push(portLoad[p])
      }
      if (olt) for (let o = 0; o < oltCount; o++) oltLoads.push(oltLoad[o])
      perStepLoad.push(delivered)
      perStepPort.push(busiest)
      perStepSat.push(reaching > parent + 1e-6)
    }
  }

  // Per-second buckets for the chart.
  const perBucket = Math.max(1, Math.round(1 / dt))
  const delivered: number[] = []
  const busiestPort: number[] = []
  const saturated: boolean[] = []
  for (let i = 0; i < perStepLoad.length; i += perBucket) {
    const end = Math.min(perStepLoad.length, i + perBucket)
    let load = 0
    let port = 0
    let sat = 0
    for (let k = i; k < end; k++) {
      load += perStepLoad[k]
      port = Math.max(port, perStepPort[k])
      if (perStepSat[k]) sat++
    }
    delivered.push(load / (end - i))
    busiestPort.push(port)
    saturated.push(sat * 2 >= end - i)
  }

  const loads = Float64Array.from(perStepLoad).sort()
  const avgLoad = perStepLoad.reduce((a, b) => a + b, 0) / Math.max(1, perStepLoad.length)
  const sortedPorts = Float64Array.from(portLoads).sort()
  const sortedOlts = Float64Array.from(oltLoads).sort()

  return {
    stepS: dt,
    durationS: measured,
    bucketS: perBucket * dt,
    delivered,
    busiestPort,
    saturated,
    parent: {
      avgMbps: avgLoad,
      p95Mbps: quantile(loads, 0.95),
      saturatedShare: perStepSat.filter(Boolean).length / Math.max(1, perStepSat.length),
    },
    ports: pon
      ? {
          count: portCount,
          capacityMbps: portCap,
          p95Mbps: quantile(sortedPorts, 0.95),
          saturatedShare: portSatSteps / Math.max(1, perStepLoad.length * portCount),
        }
      : null,
    olts: olt
      ? {
          count: oltCount,
          portsPerOlt,
          uplinkMbps: oltCap,
          p95Mbps: quantile(sortedOlts, 0.95),
          saturatedShare: oltSatSteps / Math.max(1, perStepLoad.length * oltCount),
        }
      : null,
    offeredMbps: avg * N,
    offeredPerPortMbps: pon ? avg * Math.min(homes, N) : null,
    offeredPerOltMbps: olt ? avg * Math.min(N, (pon ? homes : N) * portsPerOlt) : null,
    videoShortShare: streamSteps > 0 ? shortSteps / streamSteps : null,
    perClientMbps: N ? movedMb / (measured * N) : 0,
    plans: plans.map((p, k) => {
      const sortedTests = [...trimmed[k]].sort((a, b) => a - b)
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
      return {
        id: p.id,
        planMbps: p.planMbps,
        clients: p.clients,
        transferMbps: transferS[k] > 0 ? transferMb[k] / transferS[k] : 0,
        transfers: transferCount[k],
        testMbps: mean(trimmed[k]),
        testPlainMbps: mean(plain[k]),
        testP10Mbps: quantile(sortedTests, 0.1),
        tests: trimmed[k].length,
      }
    }),
    clients: N,
  }
}

/**
 * Lowest share of plan speed that 9 of 10 busiest-hour speed tests reach
 * (10th percentile of the readings), over the plans with clients.
 */
export function worstTestShare(r: CapacityResult): { share: number; id: string | null } {
  let share = Number.POSITIVE_INFINITY
  let id: string | null = null
  for (const p of r.plans) {
    if (p.clients <= 0 || p.tests === 0) continue
    const s = p.testP10Mbps / p.planMbps
    if (s < share) {
      share = s
      id = p.id
    }
  }
  return { share: Number.isFinite(share) ? share : 0, id }
}

export type UplinkSizing =
  /** Smallest uplink (rounded up) where 9 of 10 speed tests reach the target in every plan. */
  | { ok: true; parentMbps: number; share: number }
  /** Not even an unlimited uplink gets there: the OLT's uplink, the PON ports or the queue rule cap it (or no clients). */
  | { ok: false; limit: "olt" | "pon" | "queue" | "none"; bestShare: number; id: string | null }

export type Sizing = {
  uplink: UplinkSizing
  /**
   * Most clients per port that still reach the target with an unlimited
   * uplink, per PON technology. 0 = not even one (the queue rule caps it);
   * MAX_HOMES_PER_PORT (the 1:128 split) = at least that many.
   */
  perPort: Record<Exclude<PonTech, "none">, number>
}

/** Sizing runs are shorter than the shown run (they repeat the model ~40 times). */
const SIZING_DURATION_S = 300

/**
 * Uplink needed for 9 of 10 busiest-hour speed tests to reach `target` ×
 * plan speed in every plan (with the OLTs as configured); and how many
 * clients a GPON / XG-PON / XGS-PON port holds for the same target, up to
 * the 1:128 split. `onProgress` reports 0..1.
 */
export function size(input: Omit<CapacityInput, "parentMbps">, target: number, onProgress?: (done: number) => void): Sizing {
  const base = { ...input, durationS: SIZING_DURATION_S }
  const clientsTotal = input.plans.reduce((a, p) => a + Math.max(0, Math.round(p.clients)), 0)
  // Below the average load the backlog only grows: it fails, no need to simulate.
  const overloaded = (parentMbps: number, pon: PonConfig, olt: OltConfig | null | undefined) => {
    const homes = Math.min(Math.max(1, Math.round(pon.homesPerPort)), clientsTotal)
    return (
      input.avgMbps * clientsTotal >= parentMbps ||
      (pon.tech !== "none" && input.avgMbps * homes >= portCapacity({ pon, direction: input.direction })) ||
      (oltOn(olt) && input.avgMbps * Math.min(clientsTotal, (pon.tech !== "none" ? homes : clientsTotal) * olt.portsPerOlt) >= olt.uplinkMbps)
    )
  }
  const share = (parentMbps: number, pon: PonConfig = base.pon, olt: OltConfig | null | undefined = base.olt) =>
    overloaded(parentMbps, pon, olt) ? { share: 0, id: null } : worstTestShare(simulateCapacity({ ...base, parentMbps, pon, olt }))
  const meets = (s: { share: number }) => s.share + 1e-9 >= target
  let runs = 0
  const EST = 40
  const tick = () => onProgress?.(Math.min(0.99, ++runs / EST))

  // Uplink.
  let uplink: UplinkSizing
  const total = input.plans.reduce((a, p) => a + Math.max(0, p.clients), 0)
  const best = share(Number.POSITIVE_INFINITY)
  tick()
  // An overloaded layer reads as share 0 with no plan: still classify it below.
  if (total === 0) uplink = { ok: false, limit: "none", bestShare: 0, id: null }
  else if (!meets(best)) {
    // Remove the bottlenecks one at a time to say which one caps it.
    let limit: "olt" | "pon" | "queue" = "queue"
    if (oltOn(input.olt) && meets(share(Number.POSITIVE_INFINITY, input.pon, null))) limit = "olt"
    else if (input.pon.tech !== "none" && meets(share(Number.POSITIVE_INFINITY, { ...input.pon, tech: "none" }, null))) limit = "pon"
    tick()
    uplink = { ok: false, limit, bestShare: best.share, id: best.id }
  } else {
    // Above every client's ceiling at once nothing is ever trimmed: same as unlimited.
    const ceilingAll = input.plans.reduce((a, p) => a + Math.max(0, p.clients + 1) * Math.max(p.params.burstLimit, p.params.maxLimit), 0)
    // The answer sits above the average load: search up from there, then halve.
    let lo = Math.min(ceilingAll, input.avgMbps * clientsTotal)
    let hi = Math.min(ceilingAll, Math.max(lo * 1.25, lo + Math.max(...input.plans.map((p) => p.planMbps))))
    while (hi < ceilingAll && !meets(share(hi))) {
      tick()
      lo = hi
      hi = Math.min(ceilingAll, hi * 1.6)
    }
    for (let i = 0; i < 20 && hi - lo > Math.max(1, hi * 0.005); i++) {
      const mid = (lo + hi) / 2
      if (meets(share(mid))) hi = mid
      else lo = mid
      tick()
    }
    const step = hi >= 10_000 ? 100 : hi >= 1000 ? 50 : 10
    const parentMbps = Math.ceil(hi / step) * step
    uplink = { ok: true, parentMbps, share: share(parentMbps).share }
    tick()
  }

  // Clients per port, both technologies, unlimited uplink. A port only sees its own homes, so
  // these runs use a few ports' worth of clients in the same plan mix (much faster).
  const perPort = { gpon: 0, xgpon: 0, xgspon: 0 }
  const SAMPLE_PORTS = 6
  const scaled = (homes: number) => {
    const want = Math.min(clientsTotal, homes * SAMPLE_PORTS)
    return input.plans.map((p) => ({ ...p, clients: p.clients > 0 ? Math.max(1, Math.round((p.clients / clientsTotal) * want)) : 0 }))
  }
  for (const tech of ["gpon", "xgpon", "xgspon"] as const) {
    const ok = (homes: number) => {
      tick()
      const pon = { ...input.pon, tech, homesPerPort: homes }
      if (overloaded(Number.POSITIVE_INFINITY, pon, null)) return false
      return meets(worstTestShare(simulateCapacity({ ...base, plans: scaled(homes), parentMbps: Number.POSITIVE_INFINITY, pon, olt: null })))
    }
    if (total === 0 || !ok(1)) continue
    let lo = 1
    let hi = MAX_HOMES_PER_PORT
    if (ok(hi)) lo = hi
    else {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (ok(mid)) lo = mid
        else hi = mid
      }
    }
    perPort[tech] = lo
  }
  onProgress?.(1)
  return { uplink, perPort }
}
