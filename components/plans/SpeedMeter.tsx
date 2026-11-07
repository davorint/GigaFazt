import { useTranslations } from "next-intl"

const SEGMENTS = 10

/**
 * Linear 10-segment ↓/↑ meter against the fastest plan (200 → 2, 500 → 5,
 * 1 Gbps → 10), so the difference between tiers is obvious. Decorative: the
 * card heading carries the speed for assistive tech.
 */
export function SpeedMeter({ downMbps, upMbps, maxMbps }: { downMbps: number; upMbps: number; maxMbps: number }) {
  const t = useTranslations("plans")
  const lit = (v: number) => Math.max(1, Math.round((SEGMENTS * v) / maxMbps))
  return (
    <div aria-hidden className="grid gap-1.5 font-mono text-[0.65rem] text-muted-foreground">
      {[
        { arrow: "↓", value: downMbps, title: t("down"), on: "bg-fiber shadow-[0_0_8px_var(--color-fiber)]" },
        { arrow: "↑", value: upMbps, title: t("up"), on: "bg-violet-400 shadow-[0_0_8px_var(--color-violet-400)]" },
      ].map((row) => (
        <div key={row.arrow} className="flex items-center gap-2" title={row.title}>
          <span className={row.arrow === "↓" ? "w-2 text-fiber" : "w-2 text-violet-300"}>{row.arrow}</span>
          <span className="grid flex-1 grid-cols-10 gap-1">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-[2px] ${i < lit(row.value) ? row.on : "bg-white/[0.07]"}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
