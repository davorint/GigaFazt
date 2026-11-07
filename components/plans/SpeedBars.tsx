import { useTranslations } from "next-intl"

/**
 * Tiny mirrored ↓/↑ bars showing symmetry (DESIGN "Plans direction"). Width is
 * log-scaled against the fastest plan so 200 Mbps still reads as a bar.
 */
export function SpeedBars({
  downMbps,
  upMbps,
  maxMbps,
}: {
  downMbps: number
  upMbps: number
  maxMbps: number
}) {
  const t = useTranslations("plans")
  const pct = (v: number) =>
    `${Math.max(12, (Math.log10(v) / Math.log10(maxMbps)) * 100)}%`

  return (
    <div aria-hidden className="grid gap-1 font-mono text-[0.65rem] text-muted-foreground">
      {[
        { label: "↓", value: downMbps, title: t("down") },
        { label: "↑", value: upMbps, title: t("up") },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-2" title={row.title}>
          <span className="w-2 text-fiber">{row.label}</span>
          <span className="h-1 flex-1 rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-fiber shadow-[0_0_8px_var(--color-fiber)]"
              style={{ width: pct(row.value) }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
