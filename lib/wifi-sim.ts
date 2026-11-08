import { APT, BAND_IDS, WALLS, WALL_LOSS_DB, WALL_THICKNESS_M, type BandId, type MaterialId, type Pt } from "./wifi"

/**
 * Grid and medium for the Wi-Fi wave simulation (components/fiber/WifiWaves):
 * a 2D scalar wave equation (leapfrog finite differences) on the GPU, one
 * texture channel per band. The domain is the apartment plus a margin whose
 * outer edge is a sponge layer, so waves leave instead of bouncing back.
 *
 * Illustrative, not an RF solver: real wavelengths (12.5 / 6 / 5 cm) are
 * scaled up together (same ratios) so the grid can resolve them; wall damping
 * is calibrated so one crossing costs roughly WALL_LOSS_DB; air damping and a
 * mild wall speed change (weak reflections) keep the rings readable. Tuned
 * against a NumPy replica of the shader.
 */

export const MARGIN_M = 0.6
export const DOMAIN = { x0: -MARGIN_M, y0: -MARGIN_M, w: APT.w + 2 * MARGIN_M, h: APT.h + 2 * MARGIN_M } as const
export const SIM_W = 384
export const SIM_H = Math.round((SIM_W * DOMAIN.h) / DOMAIN.w)
export const CELL_M = DOMAIN.w / SIM_W

/** Wave speed in cells per step (2D stability needs ≤ 1/√2). */
export const SIM_C = 0.5
/** Wave speed factor inside walls (partial reflection at each face). */
export const WALL_SPEED = 0.85
/** Mask bytes encode damping 0..DAMP_SCALE per step. */
export const DAMP_SCALE = 0.3

const AIR_DAMP = 0.006
const SPONGE_CELLS = 18
const SPONGE_MAX = 0.12

/** Wavelength in cells: 2.4 GHz → 22 cells, the others scaled by frequency. */
export const WAVELENGTH_CELLS: Record<BandId, number> = { b24: 22, b5: 22 * (2.4 / 5), b6: 22 * (2.4 / 6) }

export function bandOmega(b: BandId): number {
  return (2 * Math.PI * SIM_C) / WAVELENGTH_CELLS[b]
}

/** Per-step damping inside a wall so one crossing loses ~WALL_LOSS_DB. */
export function wallDamping(m: MaterialId, b: BandId): number {
  const steps = WALL_THICKNESS_M[m] / CELL_M / (SIM_C * WALL_SPEED)
  return 1 - Math.pow(10, -WALL_LOSS_DB[m][b] / 20 / steps)
}

/** Meters → texture uv (y flipped: uv 0 is the bottom row). */
export function toUv(p: Pt): [number, number] {
  return [(p.x - DOMAIN.x0) / DOMAIN.w, 1 - (p.y - DOMAIN.y0) / DOMAIN.h]
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)))
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

/**
 * The medium, RGBA bytes row by row from the bottom (WebGL texture order):
 * R/G/B = per-step damping for 2.4/5/6 GHz (÷ DAMP_SCALE), A = wave speed factor.
 */
export function buildMask(): Uint8Array {
  const out = new Uint8Array(SIM_W * SIM_H * 4)
  const wallK = Object.fromEntries(
    WALLS.map((wl, i) => [i, BAND_IDS.map((b) => wallDamping(wl.m, b))])
  ) as Record<number, number[]>

  for (let j = 0; j < SIM_H; j++) {
    for (let i = 0; i < SIM_W; i++) {
      const p = { x: DOMAIN.x0 + (i + 0.5) * CELL_M, y: DOMAIN.y0 + (SIM_H - 1 - j + 0.5) * CELL_M }
      const edge = Math.min(i, j, SIM_W - 1 - i, SIM_H - 1 - j)
      const sponge = edge < SPONGE_CELLS ? SPONGE_MAX * (1 - edge / SPONGE_CELLS) ** 2 : 0
      let k = [AIR_DAMP + sponge, AIR_DAMP + sponge, AIR_DAMP + sponge]
      let speed = 1

      WALLS.forEach((wl, wi) => {
        if (distToSegment(p, wl.a, wl.b) <= WALL_THICKNESS_M[wl.m] / 2) {
          k = k.map((v, bi) => Math.max(v, wallK[wi][bi]))
          speed = WALL_SPEED
        }
      })

      const o = (j * SIM_W + i) * 4
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(Math.min(k[c] / DAMP_SCALE, 1) * 255)
      out[o + 3] = Math.round(speed * 255)
    }
  }
  return out
}
