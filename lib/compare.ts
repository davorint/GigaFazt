import { featuredPlan, plans } from "./plans"
import { recommend } from "./recommend"
import type { Plan } from "./types"

/**
 * The plan to compare a measured connection against: the smallest plan that is
 * at least 2x the current download and upload (lib/recommend.ts speed-test
 * rule, neutral household answers), or the featured plan with no measurement.
 */
export function planForLine(line?: { downMbps: number; upMbps: number } | null): Plan {
  if (!line) return featuredPlan
  const { planId } = recommend({ people: "1-2", uses: [], wfh: "no", current: line }, plans)
  return plans.find((p) => p.id === planId) ?? featuredPlan
}
