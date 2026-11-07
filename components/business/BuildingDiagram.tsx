/**
 * Decorative cross-section of a multi-level business: the fiber enters from
 * the street, rises through the building and branches to every area. Pure SVG
 * + CSS (no JS); the flowing dash stops under reduced motion / paused
 * animations via the global rules. Hidden from AT: the page text says the same.
 */
const FLOORS = [
  { y: 60, nodes: [90, 150, 330, 390] },
  { y: 140, nodes: [80, 130, 180, 320, 400] },
  { y: 220, nodes: [100, 160, 310, 370] },
  { y: 300, nodes: [70, 120, 330, 410] },
]
const RISER = 240

export function BuildingDiagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 380" aria-hidden className={className}>
      <defs>
        <linearGradient id="biz-floor" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.05" />
          <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.18" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id="biz-node">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Building shell + floor slabs */}
      <rect x="40" y="20" width="400" height="320" rx="6" fill="none" stroke="#22d3ee" strokeOpacity="0.35" />
      {FLOORS.map((f) => (
        <g key={f.y}>
          <rect x="41" y={f.y - 40} width="398" height="80" fill="url(#biz-floor)" opacity="0.5" />
          <line x1="40" x2="440" y1={f.y + 40} y2={f.y + 40} stroke="#22d3ee" strokeOpacity="0.2" />
        </g>
      ))}

      {/* Street entry → riser */}
      <path d={`M0 362 H${RISER} V40`} fill="none" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="3" />
      <path d={`M0 362 H${RISER} V40`} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 18" className="biz-flow" />

      {/* Branches to every area */}
      {FLOORS.map((f) => {
        // One path per floor (all branches), so only 5 elements animate.
        const d = f.nodes.map((x) => `M${RISER} ${f.y + 14} H${x}`).join(" ")
        return (
          <g key={f.y}>
            <path d={d} fill="none" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="1.5" />
            <path d={d} fill="none" stroke="#a5f3fc" strokeWidth="1.5" strokeDasharray="3 14" className="biz-flow" />
            {f.nodes.map((x) => (
              <g key={x}>
                <circle cx={x} cy={f.y + 14} r="10" fill="url(#biz-node)" opacity="0.7" />
                <rect x={x - 9} y={f.y - 6} width="18" height="12" rx="2" fill="#0b1720" stroke="#22d3ee" strokeOpacity="0.8" />
              </g>
            ))}
          </g>
        )
      })}
      {FLOORS.map((f) => (
        <circle key={f.y} cx={RISER} cy={f.y + 14} r="4" fill="#67e8f9" />
      ))}
    </svg>
  )
}
