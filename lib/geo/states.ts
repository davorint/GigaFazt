import type { StateCode } from "../types"

/**
 * Service states (owner, 2026-11-06: coverage is defined at state level).
 * Outlines live in /public/geo/states.json: CONABIO 2023 municipal boundaries
 * (INEGI Marco Geoestadístico) via github.com/PhantomInsights/mexico-geojson
 * (MIT), dissolved per state and simplified (~400 m tolerance). See
 * scripts/fetch-geo.md to regenerate.
 */
export interface StateMeta {
  code: StateCode
  slug: string
  name: string
  /** Label anchor (lng, lat). */
  label: [number, number]
}

export const STATES: StateMeta[] = [
  { code: "CDMX", slug: "cdmx", name: "Ciudad de México", label: [-99.04, 19.22] },
  { code: "MEX", slug: "estado-de-mexico", name: "Estado de México", label: [-99.75, 19.62] },
  { code: "MOR", slug: "morelos", name: "Morelos", label: [-99.05, 18.75] },
]

/**
 * Camera bounds [[w, s], [e, n]]. Wider than the states so a wide (desktop)
 * container can still fit all three: maxBounds forces zoom-in otherwise.
 */
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [-102.8, 17.4],
  [-96.4, 21.2],
]

/**
 * Initial view: framed on the service zone (CDMX + bordering Edomex
 * municipios + Cuernavaca/Tepoztlán, bbox ≈ [-99.54, 18.84] – [-98.68, 19.69])
 * with a margin, so the served area fills the table and the unserved parts of
 * the states fall off toward the edges.
 */
export const MAP_FIT: [[number, number], [number, number]] = [
  [-100.0, 18.62],
  [-98.3, 19.95],
]
