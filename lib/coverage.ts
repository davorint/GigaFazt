import type { CoverageArea, StateCode } from "./types"
import { STATES } from "./geo/states"

export const STATE_NAMES: Record<StateCode, string> = {
  CDMX: "Ciudad de México",
  MEX: "Estado de México",
  MOR: "Morelos",
}

/**
 * Service zone (owner, 2026-11-07): the Mexico City metro area, i.e. all of
 * CDMX + the Estado de México municipios that border it except the northeast
 * ones, plus Cuernavaca,
 * Tepoztlán and Amatlán (a locality of Tepoztlán) in Morelos. Current clients
 * are mostly in west CDMX, Huixquilucan and Naucalpan (lib/clients.ts).
 * Street-level availability is confirmed per address when a lead comes in.
 * The map polygons come from scripts/build_service_zone.py (keep in sync).
 */
export const SERVICE_ZONE: Record<StateCode, { scope: "all" | "metro" | "localities"; places: string[] }> = {
  CDMX: { scope: "all", places: [] },
  MEX: {
    scope: "metro",
    // Edomex municipios bordering CDMX, minus the northeast ones (owner, 2026-11-07:
    // Coacalco, Ecatepec, Nezahualcóyotl, La Paz). build_service_zone.py output.
    places: [
      "Chalco",
      "Huixquilucan",
      "Juchitepec",
      "Naucalpan de Juárez",
      "Ocoyoacac",
      "Tianguistenco",
      "Tlalnepantla de Baz",
      "Tultitlán",
      "Valle de Chalco Solidaridad",
      "Xalatlaco",
    ],
  },
  // Amatlán (de Quetzalcóatl) is a locality of the Tepoztlán municipio.
  MOR: { scope: "localities", places: ["Cuernavaca", "Tepoztlán", "Amatlán"] },
}

/** One state page per service state; each page states its exact scope. */
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
