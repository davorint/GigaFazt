import { cn } from "cn"

/**
 * Static SVG poster for the hero (SPEC §2 / DESIGN "Hero 3D direction"): a
 * bundle of glowing cyan fiber strands pinching through one bright node (the
 * light source) and fanning out. It ships in the server HTML and the WebGL
 * `FiberScene` crossfades over it once idle. Pure markup, no client JS.
 *
 * Two framings that match FiberScene's node: `desktop` (landscape, node right
 * of the headline) and `mobile` (portrait, node top right, above the headline).
 *
 * `label` is the text equivalent for the whole hero visual (hard rule #9): the
 * poster is an accessible `img`, the live canvas on top is `aria-hidden`.
 */
const FRAMES = {
  desktop: {
    w: 1440,
    h: 900,
    nx: 1000,
    ny: 400,
    lefts: [-40, 80, 200, 320, 420, 520, 620, 740, 860, 960],
    rights: [120, 205, 290, 375, 450, 520, 600, 685, 770, 840],
    pull: [380, 260, 200, 1300],
    pulses: [
      [870, 403],
      [1190, 352],
      [1230, 505],
    ],
    halo: 300,
    streak: 560,
  },
  mobile: {
    w: 390,
    h: 844,
    nx: 307,
    ny: 150,
    lefts: [-130, -60, 10, 80, 140, 190, 250, 320, 390, 470],
    rights: [80, 105, 125, 142, 155, 168, 180, 198, 220, 245],
    pull: [110, 120, 40, 370],
    pulses: [
      [150, 146],
      [235, 152],
    ],
    halo: 150,
    streak: 260,
  },
} as const

export function FiberPoster({
  className,
  label,
  variant = "desktop",
}: {
  className?: string
  label: string
  variant?: keyof typeof FRAMES
}) {
  const f = FRAMES[variant]
  const { nx: NX, ny: NY } = f
  const [c1, c2, c3, c4] = f.pull
  const strands = f.lefts.map(
    (yl, i) =>
      `M0 ${yl} C ${c1} ${yl}, ${NX - c2} ${NY + (yl - NY) * 0.12}, ${NX} ${NY} C ${NX + c3} ${NY + (f.rights[i] - NY) * 0.12}, ${c4} ${f.rights[i]}, ${f.w} ${f.rights[i]}`
  )
  const id = (s: string) => `fp-${variant}-${s}`

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${f.w} ${f.h}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block", className)}
    >
      <defs>
        <linearGradient id={id("core")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id={id("bundle")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ecfeff" />
          <stop offset="0.12" stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("streak")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ecfeff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#67e8f9" stopOpacity="0.45" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <filter id={id("glow")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Soft depth wash behind the strands (pre-blurred gradient, not a canvas blur). */}
      <rect width={f.w} height={f.h} fill="#030712" />
      <ellipse cx={NX} cy={NY} rx={f.halo * 2.1} ry={f.halo * 1.6} fill={`url(#${id("bundle")})`} opacity="0.18" />

      {/* Glow halo. */}
      <g filter={`url(#${id("glow")})`} opacity="0.7">
        {strands.map((d, i) => (
          <path key={`g${i}`} d={d} stroke="#22d3ee" strokeWidth="4" fill="none" />
        ))}
      </g>

      {/* Crisp cores. */}
      <g>
        {strands.map((d, i) => (
          <path
            key={`c${i}`}
            d={d}
            stroke={`url(#${id("core")})`}
            strokeWidth="2"
            fill="none"
            opacity={0.75 + (i % 3) * 0.1}
          />
        ))}
      </g>

      {/* Light pulses frozen along a few strands. */}
      <g filter={`url(#${id("glow")})`} opacity="0.9">
        {f.pulses.map(([x, y], i) => (
          <circle key={`pg${i}`} cx={x} cy={y} r="6" fill="#a5f3fc" />
        ))}
      </g>
      {f.pulses.map(([x, y], i) => (
        <circle key={`p${i}`} cx={x} cy={y} r="4" fill="#ecfeff" />
      ))}

      {/* The node: the scene's light source (halo, anamorphic streak, hot core). */}
      <circle cx={NX} cy={NY} r={f.halo} fill={`url(#${id("bundle")})`} />
      <ellipse cx={NX} cy={NY} rx={f.streak} ry="9" fill={`url(#${id("streak")})`} />
      <circle cx={NX} cy={NY} r="14" fill="#a5f3fc" filter={`url(#${id("glow")})`} />
      <circle cx={NX} cy={NY} r="6" fill="#ffffff" />
    </svg>
  )
}
