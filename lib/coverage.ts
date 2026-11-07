import type { CoverageArea, StateCode } from "./types"

export const STATE_NAMES: Record<StateCode, string> = {
  CDMX: "Ciudad de México",
  MEX: "Estado de México",
  MOR: "Morelos",
}

/**
 * Generated from the Coverage table in docs/BUSINESS.md. Every row there is
 * still a {{PLACEHOLDER}} municipio, so we do NOT invent any area names
 * (hard rule #1, hard rule #6). This list stays empty until BUSINESS.md is
 * filled; the UI shows "POR DEFINIR" where a municipio list would go.
 * Logged in PROGRESS.md "Open questions".
 */
export const coverageAreas: CoverageArea[] = []

export function areaBySlug(slug: string): CoverageArea | undefined {
  return coverageAreas.find((a) => a.slug === slug)
}

export function areasByState(state: StateCode): CoverageArea[] {
  return coverageAreas.filter((a) => a.state === state)
}

export function coveredMunicipios(): CoverageArea[] {
  return coverageAreas.filter((a) => a.status !== "none")
}
