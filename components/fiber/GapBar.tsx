/** Linear bar relative to the plan value: the honest visual of the gap. */
export function GapBar({ value, max, muted = false }: { value: number; max: number; muted?: boolean }) {
  const pct = Math.max(1.5, Math.min(100, (value / max) * 100))
  return (
    <span aria-hidden className="mt-1.5 block h-1 w-full rounded-full bg-muted">
      <span
        className={muted ? "block h-full rounded-full bg-muted-foreground/60" : "block h-full rounded-full bg-fiber"}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}
