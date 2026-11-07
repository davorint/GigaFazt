import type { CoverageArea, StateCode } from "./types"
import { STATES } from "./geo/states"

export const STATE_NAMES: Record<StateCode, string> = {
  CDMX: "Ciudad de México",
  MEX: "Estado de México",
  MOR: "Morelos",
}

/**
 * Coverage is defined at state level (owner, 2026-11-06): the service zone is
 * CDMX, Estado de México and Morelos. Street-level availability is confirmed
 * per address when a lead comes in (the site never promises a specific
 * address is covered).
 */
export const coverageAreas: CoverageArea[] = STATES.map((s) => ({
  slug: s.slug,
  name: s.name,
  state: s.code,
  status: "available",
}))

export function areaBySlug(slug: string): CoverageArea | undefined {
  return coverageAreas.find((a) => a.slug === slug)
}

export function areasByState(state: StateCode): CoverageArea[] {
  return coverageAreas.filter((a) => a.state === state)
}

export function coveredMunicipios(): CoverageArea[] {
  return coverageAreas.filter((a) => a.status !== "none")
}
