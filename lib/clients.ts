import type { StateCode } from "./types"

/**
 * Client sites shown on the coverage map (BUSINESS.md → "Clients").
 * Positions are neighborhood-level approximations (2 decimals ≈ 1 km), never a
 * building's exact location (hard rule #6 spirit: no precise infrastructure).
 *
 * `demo: true` rows are FICTIONAL placeholders the owner asked for to populate
 * the map (2026-11-06). They render with a DEMO DATA tag (hard rule #2) and
 * must be replaced with real clients before launch.
 */
export interface ClientSite {
  id: string
  name: string
  /** Alcaldía / municipio, for display only. */
  area: string
  state: StateCode
  lngLat: [number, number]
  kind: "residential"
  demo: boolean
}

export const clients: ClientSite[] = [
  {
    id: "be-grand-pedregal",
    name: "Be Grand Pedregal",
    area: "Álvaro Obregón",
    state: "CDMX",
    lngLat: [-99.21, 19.31],
    kind: "residential",
    demo: false,
  },
  {
    id: "terre-santa-fe",
    name: "Terre Santa Fe",
    area: "Cuajimalpa",
    state: "CDMX",
    lngLat: [-99.27, 19.36],
    kind: "residential",
    demo: false,
  },
  {
    id: "demo-torres-arboleda",
    name: "Torres Arboleda",
    area: "Naucalpan",
    state: "MEX",
    lngLat: [-99.24, 19.48],
    kind: "residential",
    demo: true,
  },
  {
    id: "demo-residencial-lumen",
    name: "Residencial Lumen",
    area: "Metepec",
    state: "MEX",
    lngLat: [-99.6, 19.26],
    kind: "residential",
    demo: true,
  },
  {
    id: "demo-conjunto-cuarzo",
    name: "Conjunto Cuarzo",
    area: "Cuernavaca",
    state: "MOR",
    lngLat: [-99.23, 18.92],
    kind: "residential",
    demo: true,
  },
]

export function clientsByState(state: StateCode): ClientSite[] {
  return clients.filter((c) => c.state === state)
}
