const MAX_MS = 5
const R = 70
const CX = 90
const CY = 86

/** Point on the 180° arc for a value 0..MAX_MS (left → right). */
function polar(ms: number) {
  const a = Math.PI * (1 - Math.min(ms, MAX_MS) / MAX_MS)
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) }
}

/**
 * Semicircular p50 gauge with a p99 tick (SPEC §4). Text equivalent via
 * role="img" + `label`; the numbers are also printed beneath.
 */
export function LatencyGauge({
  p50,
  p99,
  label,
  unitLabel,
}: {
  p50: number
  p99: number
  label: string
  unitLabel: string
}) {
  const start = polar(0)
  const endFull = polar(MAX_MS)
  const v = polar(p50)
  const tick = polar(p99)
  const tickIn = { x: CX + (tick.x - CX) * 0.82, y: CY + (tick.y - CY) * 0.82 }

  return (
    <svg role="img" aria-label={label} viewBox="0 0 180 100" className="mx-auto h-28 w-full max-w-56">
      <path
        d={`M${start.x},${start.y} A${R},${R} 0 0 1 ${endFull.x},${endFull.y}`}
        fill="none"
        stroke="rgb(255 255 255 / 0.08)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d={`M${start.x},${start.y} A${R},${R} 0 0 1 ${v.x.toFixed(2)},${v.y.toFixed(2)}`}
        fill="none"
        stroke="var(--color-fiber)"
        strokeWidth="8"
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 4px var(--color-fiber))" }}
      />
      <line x1={tickIn.x} y1={tickIn.y} x2={tick.x} y2={tick.y} stroke="var(--color-warn)" strokeWidth="2" />
      <text x={CX} y={CY - 8} textAnchor="middle" className="fill-foreground font-mono text-[22px]">
        {p50.toFixed(2)}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">
        {unitLabel}
      </text>
      <text x={start.x} y={98} textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">0</text>
      <text x={endFull.x} y={98} textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">{MAX_MS}</text>
    </svg>
  )
}
