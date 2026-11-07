import { cn } from "cn"

/**
 * Static SVG poster for the hero (SPEC §2 / DESIGN "Hero 3D direction"): a
 * bundle of glowing cyan fiber strands fanning out across the viewport. This is
 * the LCP element — it ships in the server HTML and the WebGL `FiberScene`
 * crossfades over it once idle. Pure markup, no client JS.
 *
 * `label` is the text equivalent for the whole hero visual (hard rule #9): the
 * poster is an accessible `img`, the live canvas on top is `aria-hidden`.
 */
export function FiberPoster({
  className,
  label,
}: {
  className?: string
  label: string
}) {
  // Strand endpoints fanning from the bundle at (120, 450) to the right edge.
  const ends = [120, 205, 290, 375, 450, 520, 600, 685, 770, 840]

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block", className)}
    >
      <defs>
        <linearGradient id="fp-core" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="fp-bundle" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.35" stopColor="#22d3ee" stopOpacity="0.8" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <filter id="fp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Soft depth wash behind the strands (pre-blurred gradient, not a canvas blur). */}
      <rect width="1440" height="900" fill="#030712" />
      <ellipse cx="300" cy="450" rx="620" ry="520" fill="url(#fp-bundle)" opacity="0.18" />

      {/* Glow halo. */}
      <g filter="url(#fp-glow)" opacity="0.7">
        {ends.map((y, i) => (
          <path
            key={`g${i}`}
            d={`M120 450 C 480 450, 900 ${(450 + y) / 2}, 1440 ${y}`}
            stroke="#22d3ee"
            strokeWidth="4"
            fill="none"
          />
        ))}
      </g>

      {/* Crisp cores. */}
      <g>
        {ends.map((y, i) => (
          <path
            key={`c${i}`}
            d={`M120 450 C 480 450, 900 ${(450 + y) / 2}, 1440 ${y}`}
            stroke="url(#fp-core)"
            strokeWidth="2"
            fill="none"
            opacity={0.75 + (i % 3) * 0.1}
          />
        ))}
      </g>

      {/* Light pulses frozen along a few strands. */}
      <g filter="url(#fp-glow)" opacity="0.9">
        {[
          [720, 437],
          [1020, 620],
          [980, 290],
          [540, 455],
        ].map(([x, y], i) => (
          <circle key={`pg${i}`} cx={x} cy={y} r="6" fill="#a5f3fc" />
        ))}
      </g>
      {[
        [720, 437],
        [1020, 620],
        [980, 290],
        [540, 455],
      ].map(([x, y], i) => (
        <circle key={`p${i}`} cx={x} cy={y} r="4" fill="#ecfeff" />
      ))}

      {/* The bundle. */}
      <circle cx="120" cy="450" r="90" fill="url(#fp-bundle)" />
      <circle cx="120" cy="450" r="6" fill="#ecfeff" />
    </svg>
  )
}
