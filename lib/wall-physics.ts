import { BAND_IDS, WALL_THICKNESS_M, type BandId, type MaterialId } from "./wifi"

/**
 * How a wall reflects radio waves, per Wi-Fi band, from the ITU-R P.2040-3
 * building-material model (Table 3: relative permittivity η' = a·f^b and
 * conductivity σ = c·f^d S/m, f in GHz) and its multilayer-slab method at
 * normal incidence (transfer matrices). Used offline: the reflection targets
 * of the wave lab's wall calibration (scripts/calibrate-walls.ts) and tests.
 * Not imported by components.
 *
 * Results are averaged over each band's channels and over ±25 % wall
 * thickness, so the thin-slab interference of one exact thickness and
 * frequency (which real walls never match) doesn't decide the answer. A cross
 * check: for 15 cm of concrete this model loses 11 / 19 / 22 dB at
 * 2.4 / 5 / 6 GHz, in line with the reference WALL_LOSS_DB (12 / 20 / 23).
 */

type Itu = { a: number; b: number; c: number; d: number }

/** ITU-R P.2040-3 Table 3 (valid 1–100 GHz; brick 1–10 GHz). */
export const ITU_MATERIALS = {
  air: { a: 1, b: 0, c: 0, d: 0 },
  concrete: { a: 5.24, b: 0, c: 0.0462, d: 0.7822 },
  brick: { a: 3.91, b: 0, c: 0.0238, d: 0.16 },
  plasterboard: { a: 2.73, b: 0, c: 0.0085, d: 0.9395 },
} as const satisfies Record<string, Itu>

type Layer = { m: keyof typeof ITU_MATERIALS; t: number }

/**
 * Each wall type as layers (meters), matching WALL_THICKNESS_M: a solid
 * concrete wall; clay brick with 1.5 cm of plaster each side (aplanado);
 * a drywall partition, two 12.7 mm boards on studs with the cavity between.
 */
export const WALL_LAYERS: Record<MaterialId, readonly Layer[]> = {
  concrete: [{ m: "concrete", t: WALL_THICKNESS_M.concrete }],
  brick: [
    { m: "plasterboard", t: 0.015 },
    { m: "brick", t: WALL_THICKNESS_M.brick - 0.03 },
    { m: "plasterboard", t: 0.015 },
  ],
  drywall: [
    { m: "plasterboard", t: 0.0127 },
    { m: "air", t: WALL_THICKNESS_M.drywall - 0.0254 },
    { m: "plasterboard", t: 0.0127 },
  ],
}

/** Channel ranges of each band, GHz (6 GHz: the U-NII-5…8 span). */
export const BAND_RANGE_GHZ: Record<BandId, readonly [number, number]> = {
  b24: [2.4, 2.4835],
  b5: [5.15, 5.85],
  b6: [5.925, 7.125],
}

// Minimal complex arithmetic.
type Cx = readonly [number, number]
const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]]
const sub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]]
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const div = (a: Cx, b: Cx): Cx => {
  const q = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]
}
const abs = (a: Cx) => Math.hypot(a[0], a[1])
const csqrt = (a: Cx): Cx => {
  const r = Math.sqrt(abs(a))
  const th = Math.atan2(a[1], a[0]) / 2
  return [r * Math.cos(th), r * Math.sin(th)]
}
const cexp = (a: Cx): Cx => [Math.exp(a[0]) * Math.cos(a[1]), Math.exp(a[0]) * Math.sin(a[1])]
const I: Cx = [0, 1]
const ccos = (z: Cx): Cx => {
  const s = add(cexp(mul(I, z)), cexp(mul([0, -1], z)))
  return [s[0] / 2, s[1] / 2]
}
const csin = (z: Cx): Cx => div(sub(cexp(mul(I, z)), cexp(mul([0, -1], z))), [0, 2])

/** Complex refractive index √(η' − j·σ/(ω·ε0)); σ/(ω·ε0) = 17.98·σ/f(GHz). */
function index(m: Itu, ghz: number): Cx {
  const eta = m.a * ghz ** m.b
  const sigma = m.c * ghz ** m.d
  return csqrt([eta, (-17.98 * sigma) / ghz])
}

/** Power reflection and transmission of a layered wall in air, dB (both ≤ 0). */
export function slabDb(layers: readonly Layer[], ghz: number): { r: number; t: number } {
  const k0 = (2 * Math.PI * ghz * 1e9) / 299_792_458
  let m: [Cx, Cx, Cx, Cx] = [[1, 0], [0, 0], [0, 0], [1, 0]]
  for (const l of layers) {
    const n = index(ITU_MATERIALS[l.m], ghz)
    const dl = mul(n, [k0 * l.t, 0])
    const c = ccos(dl)
    const s = csin(dl)
    const L: [Cx, Cx, Cx, Cx] = [c, div(mul(I, s), n), mul(mul(I, n), s), c]
    m = [
      add(mul(m[0], L[0]), mul(m[1], L[2])),
      add(mul(m[0], L[1]), mul(m[1], L[3])),
      add(mul(m[2], L[0]), mul(m[3], L[2])),
      add(mul(m[2], L[1]), mul(m[3], L[3])),
    ]
  }
  const B = add(m[0], m[1])
  const C = add(m[2], m[3])
  const den = add(B, C)
  return { r: 20 * Math.log10(abs(div(sub(B, C), den))), t: 20 * Math.log10(abs(div([2, 0], den))) }
}

/** Band- and thickness-averaged power reflection/transmission of a wall, dB. */
export function wallResponseDb(m: MaterialId, b: BandId): { r: number; t: number } {
  const [lo, hi] = BAND_RANGE_GHZ[b]
  let r = 0
  let t = 0
  let n = 0
  for (let s = 0; s <= 10; s++) {
    const scale = 0.75 + 0.05 * s
    const layers = WALL_LAYERS[m].map((l) => ({ ...l, t: l.t * scale }))
    for (let i = 0; i < 24; i++) {
      const q = slabDb(layers, lo + ((hi - lo) * (i + 0.5)) / 24)
      r += 10 ** (q.r / 10)
      t += 10 ** (q.t / 10)
      n++
    }
  }
  return { r: 10 * Math.log10(r / n), t: 10 * Math.log10(t / n) }
}

/** Reflection targets for every wall type and band, dB. */
export function wallReflectionTable(): Record<MaterialId, Record<BandId, number>> {
  const mats: MaterialId[] = ["concrete", "brick", "drywall"]
  return Object.fromEntries(
    mats.map((m) => [m, Object.fromEntries(BAND_IDS.map((b) => [b, wallResponseDb(m, b).r]))])
  ) as Record<MaterialId, Record<BandId, number>>
}
