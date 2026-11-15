/**
 * Several client queues under one parent (HTB, as RouterOS queues work):
 *
 * 1. Each child gets up to its `limit-at` first (if the sum of limit-at
 *    is more than the parent can give, they are scaled down together).
 * 2. What the parent has left goes to the children that want more, highest
 *    priority first (1 = highest, 8 = lowest), up to each child's own ceiling
 *    (burst-limit while its burst is allowed, max-limit otherwise).
 * 3. Children with the same priority share it equally (max-min fair).
 *    Real HTB weights that share by quantum, so this is an approximation.
 *
 * Each child keeps its own burst average, so the parent being full also
 * shortens or delays a child's burst. The burst decision runs every step
 * (the shortest child sub-window, burst-time ÷ 16); the sharing itself runs
 * on ~60 ms ticks inside the step, so a short transfer (a web page) gets its
 * fair share at that moment and finishes, instead of being spread over the
 * whole step.
 */

import { burstEnabled, stepSeconds, type QueueParams } from "./burst"
import { makeSource, type Pattern, type TransferStats } from "./traffic"

export type Member = {
  params: QueueParams
  /** 1 (highest) … 8 (lowest), as RouterOS. */
  priority: number
  pattern: Pattern
}

export type Allocation = { want: number; limitAt: number; priority: number }

const EPS = 1e-9

/** One step of HTB sharing. `want` must already be capped by the child's own ceiling. */
export function allocate(parentMbps: number, children: Allocation[]): number[] {
  const want = children.map((c) => Math.max(0, Number.isFinite(c.want) ? c.want : 0))
  const parent = Math.max(0, parentMbps)
  const out = children.map((c, i) => Math.min(want[i], Math.max(0, c.limitAt)))
  const guaranteed = out.reduce((a, b) => a + b, 0)
  if (guaranteed > parent + EPS) return out.map((v) => (v * parent) / guaranteed)

  let left = parent - guaranteed
  const priorities = [...new Set(children.map((c) => c.priority))].sort((a, b) => a - b)
  for (const prio of priorities) {
    let open = children.map((c, i) => i).filter((i) => children[i].priority === prio && want[i] - out[i] > EPS)
    while (left > EPS && open.length > 0) {
      const share = left / open.length
      let used = 0
      const still: number[] = []
      for (const i of open) {
        const give = Math.min(share, want[i] - out[i])
        out[i] += give
        used += give
        if (want[i] - out[i] > EPS) still.push(i)
      }
      left -= used
      open = still
      if (used <= EPS) break
    }
    if (left <= EPS) break
  }
  return out
}

export type SharedSample = {
  t: number
  /** Delivered per child, Mbps. */
  rates: number[]
  /** What each child could take (want capped by its own ceiling), averaged over the step. */
  asks: number[]
  /** Each child's own ceiling (burst-limit or max-limit). */
  ceilings: number[]
  /** Each child's burst was allowed (average under its threshold). */
  burstAllowed: boolean[]
  /** The children together asked for more than the parent has, for at least half the step. */
  congested: boolean
}

export type MemberStats = {
  totalMb: number
  /** Mean rate over the steps where the child asked for traffic. */
  activeAvgMbps: number
  activeS: number
  /** Seconds delivered above max-limit. */
  burstS: number
  /** Share of its active time the child got at least min(ask, limit-at). null without limit-at. */
  guaranteeMet: number | null
  transfer: TransferStats | null
}

export type SharedResult = {
  stepS: number
  durationS: number
  samples: SharedSample[]
  members: MemberStats[]
  parent: { avgMbps: number; peakMbps: number; congestedS: number }
}

export function simulateShared(parentMbps: number, members: Member[], durationS: number, opts: { lineCapMbps?: number | null } = {}): SharedResult {
  const dt = members.length ? Math.min(...members.map((m) => stepSeconds(m.params))) : 0.5
  const steps = Math.max(1, Math.ceil(durationS / dt - 1e-9))
  const ticks = Math.max(1, Math.min(16, Math.round(dt / 0.06)))
  const tick = dt / ticks
  const cap = opts.lineCapMbps && opts.lineCapMbps > 0 ? opts.lineCapMbps : Number.POSITIVE_INFINITY

  const state = members.map((m) => {
    const len = m.params.burstTime > 0 ? Math.max(1, Math.round(m.params.burstTime / dt)) : 1
    return {
      m,
      canBurst: burstEnabled(m.params),
      window: new Array<number>(len).fill(0),
      len,
      sum: 0,
      head: 0,
      source: makeSource(m.pattern),
      totalMb: 0,
      activeMb: 0,
      activeS: 0,
      burstS: 0,
      met: 0,
      needed: 0,
    }
  })

  const samples: SharedSample[] = []
  let parentMb = 0
  let parentPeak = 0
  let congestedS = 0

  for (let i = 0; i < steps; i++) {
    const t = i * dt
    const ceilings: number[] = []
    const burstAllowed: boolean[] = []
    for (const s of state) {
      const allowed = s.canBurst && s.sum / s.len < s.m.params.burstThreshold
      burstAllowed.push(allowed)
      ceilings.push(Math.min(allowed ? s.m.params.burstLimit : s.m.params.maxLimit, cap))
    }

    const stepMb = new Array<number>(state.length).fill(0)
    const askSum = new Array<number>(state.length).fill(0)
    let fullTicks = 0
    for (let j = 0; j < ticks; j++) {
      const at = t + j * tick
      const asks = state.map((s, k) => Math.min(s.source.want(at, tick), ceilings[k]))
      if (asks.reduce((a, b) => a + b, 0) > parentMbps + 1e-6) fullTicks++
      const given = allocate(
        parentMbps,
        state.map((s, k) => ({ want: asks[k], limitAt: s.m.params.limitAt, priority: s.m.priority }))
      )
      state.forEach((s, k) => {
        const mb = s.source.serve(at, tick, given[k])
        stepMb[k] += mb
        askSum[k] += asks[k]
        if (asks[k] > 0) {
          s.activeMb += mb
          s.activeS += tick
          if (s.m.params.limitAt > 0) {
            s.needed++
            if (mb / tick >= Math.min(asks[k], s.m.params.limitAt) - 1e-6) s.met++
          }
        }
      })
    }

    const rates = state.map((s, k) => {
      const rate = stepMb[k] / dt
      s.sum += rate - s.window[s.head]
      s.window[s.head] = rate
      s.head = (s.head + 1) % s.len
      if (Math.abs(s.sum) < 1e-9) s.sum = 0
      s.totalMb += stepMb[k]
      if (rate > s.m.params.maxLimit + 1e-9) s.burstS += dt
      return rate
    })
    const asks = askSum.map((a) => a / ticks)

    const used = rates.reduce((a, b) => a + b, 0)
    parentMb += used * dt
    parentPeak = Math.max(parentPeak, used)
    congestedS += (dt * fullTicks) / ticks
    samples.push({ t, rates, asks, ceilings, burstAllowed, congested: fullTicks * 2 >= ticks })
  }

  const runS = steps * dt
  return {
    stepS: dt,
    durationS: runS,
    samples,
    members: state.map((s) => ({
      totalMb: s.totalMb,
      activeAvgMbps: s.activeS > 0 ? s.activeMb / s.activeS : 0,
      activeS: s.activeS,
      burstS: s.burstS,
      guaranteeMet: s.m.params.limitAt > 0 && s.needed > 0 ? s.met / s.needed : null,
      transfer: s.source.stats(),
    })),
    parent: { avgMbps: parentMb / runS, peakMbps: parentPeak, congestedS },
  }
}
