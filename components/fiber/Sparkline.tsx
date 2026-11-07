/** Tiny decorative SVG sparkline (aria-hidden; the tile states the value). */
export function Sparkline({ values, max }: { values: number[]; max?: number }) {
  const w = 120
  const h = 28
  if (values.length < 2) return <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" />
  const top = max ?? Math.max(...values) * 1.15
  const step = w / (values.length - 1)
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / (top || 1)) * h).toFixed(1)}`)
    .join(" ")
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full">
      <path d={d} fill="none" stroke="var(--color-fiber)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
