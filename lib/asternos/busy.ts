/**
 * Busy hour on AsterNOS-VPP (owner, 2026-11-20): many clients per plan sharing the carriers through the HQoS hierarchy
 * (global rate → one group per plan, optionally capped → one user per client, capped at its plan). At any moment some
 * clients are active; bandwidth is shared max-min fairly (water-filling: nobody gets more than they ask, the rest is
 * split evenly), first among the plan groups, then among each group's clients.
 *
 * Monte Carlo with a seeded random generator (same inputs → same result). The active share and the demand are inputs
 * (assumptions to fit with the owner's data, never presented as facts).
 */

export type BusyPlan = {
  name: string
  clients: number
  /** What an active client is held to at the busy hour (its sustained speed: bursts run out under load). */
  capMbps: number
  /** What a new speed test may reach (its peak). */
  peakMbps: number
  /** Optional cap of the plan's HQoS group, Mbps (null = none). */
  groupMbps: number | null
}

export type BusyInput = {
  plans: BusyPlan[]
  /** The carriers together (HQoS global rate), Mbps. */
  capacityMbps: number
  /** Share of clients using the internet at the same time at the busy hour (0–1). */
  activeShare: number
  /** What an active client asks for, as a share of its cap (1 = everyone active saturates). */
  demandShare: number
  trials?: number
  seed?: number
}

export type BusyPlanResult = {
  name: string
  /** Speed an active client gets, as a share of its cap: typical (median) and bad moments (5th percentile). */
  p50: number
  p5: number
  /** Mbps an active client gets at those points. */
  p50Mbps: number
  p5Mbps: number
  /** Speed test from a client at that moment: median Mbps (min of its peak and the free share). */
  testMbps: number
}

export type BusyResult = {
  plans: BusyPlanResult[]
  /** Carrier load: median and 95th percentile, share of capacity. */
  load50: number
  load95: number
  /** Share of moments with the carriers full (demand above capacity). */
  saturated: number
  /** Contracted caps ÷ capacity (all clients at their cap at once). */
  oversubscription: number
}

/** Deterministic random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Binomial sample (normal approximation for large n, exact otherwise). */
function binomial(n: number, p: number, r: () => number): number {
  if (n <= 0 || p <= 0) return 0
  if (p >= 1) return n
  if (n < 60) {
    let k = 0
    for (let i = 0; i < n; i++) if (r() < p) k++
    return k
  }
  const mean = n * p
  const sd = Math.sqrt(n * p * (1 - p))
  const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  return Math.max(0, Math.min(n, Math.round(mean + sd * z)))
}

/** Max-min fair split of `total` among demands (water-filling). */
export function waterFill(demands: number[], total: number): number[] {
  const out = demands.map(() => 0)
  let left = Math.max(0, total)
  let open = demands.map((d, i) => ({ d, i })).filter((x) => x.d > 0)
  while (open.length && left > 1e-9) {
    const share = left / open.length
    const small = open.filter((x) => x.d - out[x.i] <= share + 1e-12)
    if (!small.length) {
      for (const x of open) out[x.i] += share
      left = 0
      break
    }
    for (const x of small) {
      left -= x.d - out[x.i]
      out[x.i] = x.d
    }
    open = open.filter((x) => out[x.i] < x.d - 1e-12)
  }
  return out
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]
}

export function simulateBusyHour(input: BusyInput): BusyResult {
  const trials = input.trials ?? 800
  const r = rng(input.seed ?? 7)
  const ratios: number[][] = input.plans.map(() => [])
  const tests: number[][] = input.plans.map(() => [])
  const loads: number[] = []
  let saturated = 0
  for (let k = 0; k < trials; k++) {
    const active = input.plans.map((p) => binomial(p.clients, input.activeShare, r))
    const want = input.plans.map((p, i) => active[i] * p.capMbps * input.demandShare)
    // Groups: each asks for its clients' demand, up to its own cap.
    const groupWant = want.map((w, i) => Math.min(w, input.plans[i].groupMbps ?? Infinity))
    const groupGot = waterFill(groupWant, input.capacityMbps)
    const totalWant = want.reduce((a, b) => a + b, 0)
    if (totalWant > input.capacityMbps + 1e-9) saturated++
    loads.push(Math.min(1, groupGot.reduce((a, b) => a + b, 0) / (input.capacityMbps || 1)))
    input.plans.forEach((p, i) => {
      // Inside a group every active client asks the same, so each gets an equal share.
      const per = active[i] > 0 ? groupGot[i] / active[i] : 0
      if (active[i] > 0) ratios[i].push(Math.min(1, per / (p.capMbps * input.demandShare || 1)))
      // A speed test right now: one more client of this plan asking for its peak, shared the same fair way.
      const withTest = want.map((w, j) => Math.min(j === i ? w + p.peakMbps : w, input.plans[j].groupMbps ?? Infinity))
      const groupNow = waterFill(withTest, input.capacityMbps)[i]
      const inGroup = waterFill([...Array(active[i]).fill(p.capMbps * input.demandShare), p.peakMbps], groupNow)
      tests[i].push(inGroup[inGroup.length - 1])
    })
  }
  const contracted = input.plans.reduce((a, p) => a + p.clients * p.capMbps, 0)
  return {
    plans: input.plans.map((p, i) => {
      const p50 = ratios[i].length ? quantile(ratios[i], 0.5) : 1
      const p5 = ratios[i].length ? quantile(ratios[i], 0.05) : 1
      const want = p.capMbps * input.demandShare
      return { name: p.name, p50, p5, p50Mbps: p50 * want, p5Mbps: p5 * want, testMbps: quantile(tests[i], 0.5) }
    }),
    load50: quantile(loads, 0.5),
    load95: quantile(loads, 0.95),
    saturated: saturated / trials,
    oversubscription: input.capacityMbps > 0 ? contracted / input.capacityMbps : Infinity,
  }
}

/**
 * How many times the current clients the carriers hold while every plan's bad moments (5th percentile) stay at or above
 * `target` of its cap. Clients of every plan grow together.
 */
export function maxGrowth(input: BusyInput, target: number): number {
  const ok = (f: number) => simulateBusyHour({ ...input, trials: 300, plans: input.plans.map((p) => ({ ...p, clients: Math.round(p.clients * f) })) }).plans.every((x) => x.p5 >= target - 1e-9)
  if (!input.plans.some((p) => p.clients > 0)) return 0
  if (!ok(1)) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      if (ok(mid)) lo = mid
      else hi = mid
    }
    return lo
  }
  let lo = 1
  let hi = 2
  while (hi < 64 && ok(hi)) {
    lo = hi
    hi *= 2
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}
