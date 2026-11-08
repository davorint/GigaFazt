/**
 * Decorative backdrop for the final CTA: the hero's fiber strands, now coming
 * in from both edges and converging behind the selected-plan ticket (same
 * light both ways = symmetrical). Static SVG, server-rendered; the only motion
 * is a slow CSS "breathing" of the meeting glow (`.finale-core`), paused
 * offscreen and stopped under reduced motion / paused animations.
 */
const CX = 720
const CY = 540
const ENDS = [70, 160, 250, 340, 420, 500, 590, 690, 790, 860]

const strand = (y: number, side: -1 | 1) => {
  const x0 = side === -1 ? 0 : 1440
  const c1 = CX + side * 520
  const c2 = CX + side * 220
  return `M${x0} ${y} C ${c1} ${y}, ${c2} ${CY}, ${CX} ${CY}`
}

export function FinaleStrands() {
  const paths = ENDS.flatMap((y) => [strand(y, -1), strand(y, 1)])
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="block size-full">
        <defs>
          <linearGradient id="fs-l" x1="0" y1="0" x2={CX} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0891b2" stopOpacity="0.15" />
            <stop offset="0.7" stopColor="#22d3ee" stopOpacity="0.7" />
            <stop offset="1" stopColor="#a5f3fc" />
          </linearGradient>
          <linearGradient id="fs-r" x1="1440" y1="0" x2={CX} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0891b2" stopOpacity="0.15" />
            <stop offset="0.7" stopColor="#22d3ee" stopOpacity="0.7" />
            <stop offset="1" stopColor="#a5f3fc" />
          </linearGradient>
          <filter id="fs-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <g filter="url(#fs-glow)" opacity="0.8">
          {paths.map((d, i) => (
            <path key={`g${i}`} d={d} stroke={i % 2 ? "url(#fs-r)" : "url(#fs-l)"} strokeWidth="4" fill="none" />
          ))}
        </g>
        <g>
          {paths.map((d, i) => (
            <path
              key={`c${i}`}
              d={d}
              stroke={i % 2 ? "url(#fs-r)" : "url(#fs-l)"}
              strokeWidth="1.5"
              fill="none"
              opacity={0.75 + ((i >> 1) % 3) * 0.1}
            />
          ))}
        </g>
      </svg>

      {/* Meeting point glow + a scrim so the copy on top keeps AA contrast. */}
      <div
        className="finale-core absolute top-[60%] left-1/2 h-[46vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(165 243 252 / 0.35), rgb(6 182 212 / 0.12) 45%, transparent)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(42% 26% at 50% 30%, rgb(3 7 18 / 0.85), rgb(3 7 18 / 0.4) 65%, transparent)" }}
      />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}
