/**
 * STYLIZED corridors between hubs of the service zone (owner, 2026-11-07:
 * metro area + Cuernavaca/Tepoztlán): city center ↔ west ↔ north, and
 * center ↔ Cuernavaca ↔ Tepoztlán.
 * These are illustrative arcs between city centers, NOT real fiber routes
 * (hard rule #6). Labeled "trazo ilustrativo" in the legend.
 */
export interface Corridor {
  id: string
  from: string
  to: string
  coords: [number, number][]
}

const HUBS = {
  cdmx: [-99.13, 19.43],
  poniente: [-99.26, 19.37],
  norte: [-99.2, 19.54],
  cuernavaca: [-99.23, 18.92],
  tepoztlan: [-99.1, 18.985],
} as const satisfies Record<string, [number, number]>

/** Quadratic-bezier arc between two points, bowed by `bend` (deg units). */
function arc(a: readonly [number, number], b: readonly [number, number], bend = 0.12, steps = 48): [number, number][] {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  // Control point offset perpendicular to the chord.
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const cx = mx - (dy / len) * bend
  const cy = my + (dx / len) * bend
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t ** 2 * b[0]
    const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t ** 2 * b[1]
    return [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]
  })
}

export const corridors: Corridor[] = [
  { id: "cdmx-poniente", from: "CDMX", to: "Poniente", coords: arc(HUBS.cdmx, HUBS.poniente, 0.03) },
  { id: "poniente-norte", from: "Poniente", to: "Norte", coords: arc(HUBS.poniente, HUBS.norte, 0.03) },
  { id: "norte-cdmx", from: "Norte", to: "CDMX", coords: arc(HUBS.norte, HUBS.cdmx, 0.03) },
  { id: "cdmx-cuernavaca", from: "CDMX", to: "Cuernavaca", coords: arc(HUBS.cdmx, HUBS.cuernavaca, 0.1) },
  { id: "cuernavaca-tepoztlan", from: "Cuernavaca", to: "Tepoztlán", coords: arc(HUBS.cuernavaca, HUBS.tepoztlan, 0.03) },
]
