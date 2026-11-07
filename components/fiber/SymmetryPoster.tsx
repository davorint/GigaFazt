import type { StreamTarget } from "./SymmetryScene"

/**
 * Static frame of "Simetría en luz" (reduced motion, paused animations, no
 * WebGL, and the first paint before the scene crossfades in). Same layout as
 * the 3D scene: a glass tube, download streaks → in the upper half, upload ←
 * in the lower half, with density following the current mode and plan.
 * Decorative: the readout next to it carries the information.
 */
const W = 1200
const H = 420
const CY = H / 2
const R = 120
const MAX = 90

// Deterministic pseudo-random positions (identical on server and client).
function streaks(seed: number) {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: MAX }, () => ({ x: rand(), lane: rand(), len: rand(), key: rand() }))
}
const DOWN = streaks(7)
const UP = streaks(13)

function Layer({ target, dir }: { target: StreamTarget; dir: 1 | -1 }) {
  const list = (dir > 0 ? DOWN : UP).filter((p) => p.key < target.density)
  const id = dir > 0 ? "sym-down" : "sym-up"
  return (
    <g>
      <defs>
        <linearGradient id={id} x1={dir > 0 ? "0" : "1"} x2={dir > 0 ? "1" : "0"} y1="0" y2="0">
          <stop offset="0" stopColor={target.color} stopOpacity="0" />
          <stop offset="1" stopColor={target.color} stopOpacity="1" />
        </linearGradient>
      </defs>
      {list.map((p, i) => {
        const x = 80 + p.x * (W - 160)
        const y = CY - dir * (0.14 + p.lane * 0.76) * R
        const len = 18 + p.len * 26 + target.speed * 10
        return <rect key={i} x={x - len / 2} y={y - 2} width={len} height={4} rx={2} fill={`url(#${id})`} />
      })}
    </g>
  )
}

export function SymmetryPoster({ down, up, className }: { down: StreamTarget; up: StreamTarget; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="sym-glass" gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0" />
          <stop offset="0.15" stopColor="#67e8f9" stopOpacity="0.8" />
          <stop offset="0.85" stopColor="#67e8f9" stopOpacity="0.8" />
          <stop offset="1" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={CY - R * 1.08} y2={CY - R * 1.08} stroke="url(#sym-glass)" strokeWidth="1.5" />
      <line x1="0" x2={W} y1={CY + R * 1.08} y2={CY + R * 1.08} stroke="url(#sym-glass)" strokeWidth="1.5" />
      <line x1="120" x2={W - 120} y1={CY} y2={CY} stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1" />
      <Layer target={down} dir={1} />
      <Layer target={up} dir={-1} />
    </svg>
  )
}
