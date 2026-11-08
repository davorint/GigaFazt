import { SIM_C } from "./wifi-sim"

/**
 * A 1D, CPU copy of the wave lab's GPU update (components/fiber/WifiWaves
 * SIM_FRAG) for a plane wave hitting one wall head-on. It measures how much the
 * simulated wall reflects and transmits, so the wall parameters can be fitted
 * to real reflection and loss figures (scripts/calibrate-walls.ts) and checked
 * in tests. Keep it in step with the shader:
 *
 *   lap  = Σ_neighbors face·(u_n − u) / z,   face = 2·z·z_n / (z + z_n)
 *   next = (2u − (1 − k)·prev + C²·lap) / (1 + k)
 *
 * z is the wall's wave impedance relative to air (same speed, so the wall
 * reflects without shortening the wavelength on a coarse grid) and k the
 * per-step loss of a velocity-damped (conductive) medium. On a 2D grid a
 * plane wave along x reduces exactly to this 1D stencil.
 */

const N = 800
const SRC = 150
const WALL_AT = 400
const SPONGE = 100
const PROBE_R = WALL_AT - 80
const PROBE_T = WALL_AT + 90
const STEPS = 3000

type Probe = { r: [number, number]; t: [number, number] }

function run(lambdaCells: number, cells: number, z: number, k: number): Probe {
  const c2 = SIM_C * SIM_C
  const om = (2 * Math.PI * SIM_C) / lambdaCells
  const zz = new Float64Array(N).fill(1)
  const kk = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const e = Math.min(i, N - 1 - i)
    if (e < SPONGE) kk[i] = 0.12 * (1 - e / SPONGE) ** 2
  }
  for (let i = WALL_AT; i < WALL_AT + cells; i++) {
    zz[i] = z
    kk[i] = k
  }
  let p = new Float64Array(N)
  let u = new Float64Array(N)
  let n = new Float64Array(N)
  // Lock-in over the last 8 whole periods (steady state by then).
  const t0 = STEPS - Math.round((8 * 2 * Math.PI) / om)
  const acc = { r: [0, 0] as [number, number], t: [0, 0] as [number, number] }
  let count = 0
  for (let t = 0; t < STEPS; t++) {
    const drive = Math.sin(om * t) * Math.min(1, t / 200)
    for (let i = 1; i < N - 1; i++) {
      const fr = (2 * zz[i] * zz[i + 1]) / (zz[i] + zz[i + 1])
      const fl = (2 * zz[i] * zz[i - 1]) / (zz[i] + zz[i - 1])
      const lap = (fr * (u[i + 1] - u[i]) + fl * (u[i - 1] - u[i])) / zz[i]
      const d = i - SRC
      n[i] = (2 * u[i] - (1 - kk[i]) * p[i] + c2 * lap) / (1 + kk[i]) + drive * Math.exp(-(d * d) / 4)
    }
    ;[p, u, n] = [u, n, p]
    if (t >= t0) {
      const s = Math.sin(om * t)
      const c = Math.cos(om * t)
      acc.r[0] += u[PROBE_R] * s
      acc.r[1] += u[PROBE_R] * c
      acc.t[0] += u[PROBE_T] * s
      acc.t[1] += u[PROBE_T] * c
      count++
    }
  }
  return { r: [acc.r[0] / count, acc.r[1] / count], t: [acc.t[0] / count, acc.t[1] / count] }
}

const free = new Map<number, Probe>()

/** Power reflection (≤ 0) and transmission loss (≥ 0) of one simulated wall, dB. */
export function replicaWall(lambdaCells: number, cells: number, z: number, k: number): { r: number; t: number } {
  if (!free.has(lambdaCells)) free.set(lambdaCells, run(lambdaCells, 0, 1, 0))
  const a = free.get(lambdaCells)!
  const b = run(lambdaCells, cells, z, k)
  return {
    r: 20 * Math.log10(Math.hypot(b.r[0] - a.r[0], b.r[1] - a.r[1]) / Math.hypot(...a.r)),
    t: -20 * Math.log10(Math.hypot(...b.t) / Math.hypot(...a.t)),
  }
}
