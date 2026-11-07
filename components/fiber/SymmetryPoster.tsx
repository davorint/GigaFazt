import type { StreamTarget } from "./SymmetryScene"

/**
 * Static frame of "Dentro de la fibra" (no WebGL, and the first paint before
 * the scene crossfades in): the view down the core, glass rings receding to a
 * bright vanishing point, cyan download spirals and violet upload spirals
 * twisting in opposite directions. Follows the controls (beam count, collapsed
 * upload in asymmetric mode). Decorative: the readout carries the information.
 */
const W = 1600
const H = 900
const CX = W / 2
const CY = H * 0.47
const F = 520 // perspective scale
const NEAR = 1.1
const RAYS = 14

// Deterministic pseudo-random (identical on server and client).
function seeds(seed: number) {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: RAYS }, (_, i) => ({ a: rand() * Math.PI * 2, r: 0.5 + rand() * 0.45, rank: (i + 0.5) / RAYS }))
}
const DOWN = seeds(11)
const UP = seeds(29)

const project = (x: number, y: number, s: number) => {
  const k = F / (s + NEAR)
  return [CX + x * k, CY + y * k] as const
}

function spiral(a0: number, r: number, twist: number) {
  const pts: string[] = []
  for (let s = 0.25; s < 42; s *= 1.06) {
    const a = a0 + twist * s
    const [x, y] = project(Math.cos(a) * r, Math.sin(a) * r, s)
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M${pts.join("L")}`
}

function Layer({ target, list, twist, id }: { target: StreamTarget; list: typeof DOWN; twist: number; id: string }) {
  const shown = list.filter((p) => p.rank < target.active)
  return (
    <g stroke={`url(#${id})`} fill="none" strokeLinecap="round">
      {shown.map((p, i) => (
        <path key={i} d={spiral(p.a, p.r * target.radius, twist)} strokeWidth={1.6} opacity={Math.min(1, 0.55 * target.gain + 0.25)} />
      ))}
    </g>
  )
}

export function SymmetryPoster({ down, up, className }: { down: StreamTarget; up: StreamTarget; className?: string }) {
  const rings = Array.from({ length: 16 }, (_, i) => 0.4 + i * i * 0.18)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <radialGradient id="core-glow" cx={CX} cy={CY} r={260} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.12" stopColor="#a5f3fc" stopOpacity="0.6" />
          <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.12" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="core-down" cx={CX} cy={CY} r={900} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={down.color} stopOpacity="0.1" />
          <stop offset="0.5" stopColor={down.color} stopOpacity="0.95" />
          <stop offset="1" stopColor={down.color} stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id="core-up" cx={CX} cy={CY} r={900} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={up.color} stopOpacity="0.1" />
          <stop offset="0.5" stopColor={up.color} stopOpacity="0.95" />
          <stop offset="1" stopColor={up.color} stopOpacity="0.5" />
        </radialGradient>
      </defs>
      {rings.map((s, i) => {
        const r = (F * 1.03) / (s + NEAR)
        return <circle key={i} cx={CX} cy={CY} r={r} fill="none" stroke="#67e8f9" strokeOpacity={0.05 + 0.25 * (1 - i / rings.length) * (i > 0 ? 1 : 0.4)} />
      })}
      <circle cx={CX} cy={CY} r={260} fill="url(#core-glow)" />
      <Layer target={down} list={DOWN} twist={0.34} id="core-down" />
      <Layer target={up} list={UP} twist={-0.34} id="core-up" />
    </svg>
  )
}
