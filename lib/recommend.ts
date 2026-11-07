/**
 * Plan recommender scoring (SPEC §3 PlanRecommender). Deterministic and pure:
 * no data imports, so it's trivially unit-testable (lib/recommend.test.ts).
 *
 * Scoring (points, summed):
 *   people          "1-2" → 1 · "3-5" → 2 · "6+" → 4
 *   uses (each)     gaming 1 · streaming4k 1 · homeOffice 1 · smartHome 1 · creator 3
 *   work from home  "no" → 0 · "one" → 1 · "several" → 2
 *
 * Tier by total: ≤ 4 → tier 0 (entry) · 5–8 → tier 1 · ≥ 9 → tier 2 (top).
 * Tiers index into the candidate plans sorted by ascending downMbps (capped at
 * the fastest candidate).
 *
 * Speed-test adjustment (when a result exists): the recommended plan must be
 * at least 2× the visitor's current download AND upload; otherwise bump one
 * tier at a time until it is, or until the top tier.
 *
 * Reason: "top" when even the fastest plan is under 2x the current connection;
 * "upgrade" if the speed test bumped the tier (and it now is >= 2x); "light" when the score
 * is ≤ 3; otherwise the single largest contributor, ties broken in the order
 * creator > people > wfh > uses.
 */

export type People = "1-2" | "3-5" | "6+"
export type Use = "gaming" | "streaming4k" | "homeOffice" | "creator" | "smartHome"
export type Wfh = "no" | "one" | "several"

export const PEOPLE: readonly People[] = ["1-2", "3-5", "6+"]
export const USES: readonly Use[] = ["gaming", "streaming4k", "homeOffice", "creator", "smartHome"]
export const WFH: readonly Wfh[] = ["no", "one", "several"]

export interface RecommendInput {
  people: People
  uses: Use[]
  wfh: Wfh
  /** Visitor's current connection, from the Phase 4 speed test, if any. */
  current?: { downMbps: number; upMbps: number }
}

export type Reason = "creator" | "people" | "wfh" | "uses" | "upgrade" | "top" | "light"

export interface RecommendResult {
  planId: string
  score: number
  tier: number
  reason: Reason
}

export interface Candidate {
  id: string
  downMbps: number
  upMbps: number
}

export const PEOPLE_POINTS: Record<People, number> = { "1-2": 1, "3-5": 2, "6+": 4 }
export const USE_POINTS: Record<Use, number> = {
  gaming: 1,
  streaming4k: 1,
  homeOffice: 1,
  smartHome: 1,
  creator: 3,
}
export const WFH_POINTS: Record<Wfh, number> = { no: 0, one: 1, several: 2 }

export function scoreOf(input: Omit<RecommendInput, "current">): number {
  const uses = [...new Set(input.uses)]
  return (
    PEOPLE_POINTS[input.people] +
    uses.reduce((sum, u) => sum + USE_POINTS[u], 0) +
    WFH_POINTS[input.wfh]
  )
}

export function tierOf(score: number): number {
  if (score <= 4) return 0
  if (score <= 8) return 1
  return 2
}

export function recommend(input: RecommendInput, candidates: Candidate[]): RecommendResult {
  if (candidates.length === 0) throw new Error("recommend: no candidate plans")
  const sorted = [...candidates].sort((a, b) => a.downMbps - b.downMbps)
  const top = sorted.length - 1
  const score = scoreOf(input)
  const base = Math.min(tierOf(score), top)

  const short = (i: number) =>
    !!input.current &&
    (sorted[i].downMbps < input.current.downMbps * 2 ||
      sorted[i].upMbps < input.current.upMbps * 2)

  let tier = base
  while (tier < top && short(tier)) tier++

  const reason: Reason = short(tier)
    ? "top"
    : tier > base
      ? "upgrade"
      : reasonOf(input, score)
  return { planId: sorted[tier].id, score, tier, reason }
}

function reasonOf(input: RecommendInput, score: number): Reason {
  if (score <= 3) return "light"
  const uses = [...new Set(input.uses)]
  const contributions: [Reason, number][] = [
    ["creator", uses.includes("creator") ? USE_POINTS.creator : 0],
    ["people", PEOPLE_POINTS[input.people]],
    ["wfh", WFH_POINTS[input.wfh]],
    ["uses", uses.filter((u) => u !== "creator").reduce((s, u) => s + USE_POINTS[u], 0)],
  ]
  // First strict max wins, so array order is the tie-break.
  return contributions.reduce((best, c) => (c[1] > best[1] ? c : best))[0]
}
