import { APT, BAND_IDS, WALLS, WALL_THICKNESS_M, type BandId, type MaterialId, type Pt } from "./wifi"
import { WALL_MEDIUM } from "./wifi-walls"

/**
 * Grid and medium for the Wi-Fi wave simulation (components/fiber/WifiWaves):
 * a 2D scalar wave equation (leapfrog finite differences) on the GPU, one
 * texture channel per band. The domain is the apartment plus a margin whose
 * outer edge is a sponge layer, so waves leave instead of bouncing back.
 *
 * Illustrative, not an RF solver: real wavelengths (12.5 / 6 / 5 cm) are
 * scaled up together (same ratios) so the grid can resolve them. Each wall
 * type has, per band, a wave impedance (how much it reflects) and a
 * conductive loss (how much it absorbs), fitted so one head-on crossing in the
 * simulation reflects and transmits like the real wall: transmission loss =
 * WALL_LOSS_DB, reflection = ITU-R P.2040 (lib/wall-physics). That's why the
 * bands behave differently at the same wall. The fit lives in lib/wifi-walls
 * (scripts/calibrate-walls.ts, checked by lib/wifi.test.ts against the 1D
 * replica in lib/wifi-replica).
 */

export const MARGIN_M = 0.6
export const DOMAIN = { x0: -MARGIN_M, y0: -MARGIN_M, w: APT.w + 2 * MARGIN_M, h: APT.h + 2 * MARGIN_M } as const
export const SIM_W = 384
export const SIM_H = Math.round((SIM_W * DOMAIN.h) / DOMAIN.w)
export const CELL_M = DOMAIN.w / SIM_W

/** Wave speed in cells per step (2D stability needs ≤ 1/√2). */
export const SIM_C = 0.5
/** Damping bytes encode a per-step loss of 0..DAMP_SCALE. */
export const DAMP_SCALE = 0.3
/** Impedance bytes encode 1..Z_MAX (relative to air). */
export const Z_MAX = 3

const AIR_DAMP = 0.006
const SPONGE_CELLS = 18
const SPONGE_MAX = 0.12

/** Wavelength in cells: 2.4 GHz → 22 cells, the others scaled by frequency. */
export const WAVELENGTH_CELLS: Record<BandId, number> = { b24: 22, b5: 22 * (2.4 / 5), b6: 22 * (2.4 / 6) }

/** Each wall type's thickness on the grid, whole cells. */
export const WALL_CELLS: Record<MaterialId, number> = {
  concrete: Math.round(WALL_THICKNESS_M.concrete / CELL_M),
  brick: Math.round(WALL_THICKNESS_M.brick / CELL_M),
  drywall: Math.round(WALL_THICKNESS_M.drywall / CELL_M),
}

export function bandOmega(b: BandId): number {
  return (2 * Math.PI * SIM_C) / WAVELENGTH_CELLS[b]
}

export const dampByte = (k: number) => Math.round(Math.min(Math.max(k / DAMP_SCALE, 0), 1) * 255)
export const dampOf = (byte: number) => (byte / 255) * DAMP_SCALE
export const zByte = (z: number) => Math.round(Math.min(Math.max((z - 1) / (Z_MAX - 1), 0), 1) * 255)
export const zOf = (byte: number) => 1 + (byte / 255) * (Z_MAX - 1)

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
 * The medium as two RGBA byte textures, rows from the bottom (WebGL order),
 * R/G/B = 2.4/5/6 GHz: `damp` = per-step loss (÷ DAMP_SCALE; air, sponge and
 * walls), `imp` = wave impedance (1 = air … Z_MAX). Walls are exactly
 * WALL_CELLS thick, as calibrated.
 */
export function buildMedium(): { damp: Uint8Array; imp: Uint8Array } {
  const damp = new Uint8Array(SIM_W * SIM_H * 4)
  const imp = new Uint8Array(SIM_W * SIM_H * 4)
  for (let j = 0; j < SIM_H; j++) {
    for (let i = 0; i < SIM_W; i++) {
      const p = { x: DOMAIN.x0 + (i + 0.5) * CELL_M, y: DOMAIN.y0 + (SIM_H - 1 - j + 0.5) * CELL_M }
      const edge = Math.min(i, j, SIM_W - 1 - i, SIM_H - 1 - j)
      const sponge = edge < SPONGE_CELLS ? SPONGE_MAX * (1 - edge / SPONGE_CELLS) ** 2 : 0
      let k = BAND_IDS.map(() => AIR_DAMP + sponge)
      let z = BAND_IDS.map(() => 1)
      for (const wl of WALLS) {
        // Strict: an interval WALL_CELLS wide holds exactly that many cell centers.
        if (distToSegment(p, wl.a, wl.b) < (WALL_CELLS[wl.m] * CELL_M) / 2 - 1e-9) {
          const med = WALL_MEDIUM[wl.m]
          k = BAND_IDS.map((b) => med[b].k)
          z = BAND_IDS.map((b) => med[b].z)
        }
      }
      const o = (j * SIM_W + i) * 4
      for (let c = 0; c < 3; c++) {
        damp[o + c] = dampByte(k[c])
        imp[o + c] = zByte(z[c])
      }
      damp[o + 3] = imp[o + 3] = 255
    }
  }
  return { damp, imp }
}
