import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { cn } from "cn"
import { featuredPlan, plans } from "@/lib/plans"
import { formatMxn, formatSpeed } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { PriceTerms } from "@/components/plans/PriceTerms"
import { PlanJumpButton } from "./PlanJumpButton"

/**
 * The whole lineup along the bottom edge of the hero (owner, 2026-11-08:
 * "premium" review point 5), so the first screen shows every plan without
 * scrolling. Each cell selects its plan and scrolls to its card (flash). The
 * terms are the same for every plan: in the bar on desktop, and right under
 * the pitch above it on every size (hard rule #5). Server-rendered; only the
 * buttons are client (PlanJumpButton).
 */
export function HeroPlanStrip({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const t = useTranslations("hero")
  const tp = useTranslations("plans")
  const locale = useLocale()

  return (
    <div
      role="group"
      aria-label={t("stripLabel")}
      style={style}
      className={cn(
        "relative z-10 border-t border-white/[0.08] bg-gradient-to-b from-[#02060c]/40 to-[#02060c]/85",
        className
      )}
    >
      {/* Hairline of light along the top edge, brightest under the node. */}
      <span aria-hidden className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
      <div className="mx-auto grid max-w-7xl grid-cols-3 px-1 sm:px-6 lg:grid-cols-[1fr_1fr_1fr_auto]">
        {plans.map((p) => {
          const speed = formatSpeed(p.downMbps)
          const featured = p.id === featuredPlan.id
          return (
            <PlanJumpButton
              key={p.id}
              planId={p.id}
              className={cn(
                "group relative flex flex-col items-start gap-1.5 border-l border-white/[0.07] px-3 py-4 text-left transition-colors first:border-l-0 hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-5"
              )}
            >
              {featured && (
                <span aria-hidden className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300 to-violet-300/0 shadow-[0_0_12px_var(--color-fiber)] sm:inset-x-5" />
              )}
              <span>
                <span className="flex items-baseline gap-1 font-mono font-semibold tracking-[-0.03em] text-white">
                  <span className="text-xl sm:text-2xl">{speed.value}</span>
                  <span className="text-xs font-normal text-muted-foreground sm:text-sm">{speed.unit}</span>
                </span>
                <span className={cn("mt-0.5 block font-mono text-[0.6rem] uppercase tracking-wider", featured ? "text-fiber" : "text-muted-foreground")}>
                  {featured ? tp("popular") : `↓↑ ${tp("symmetric")}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {!isPlaceholder(p.priceMxn) && (
                  <span className="font-mono text-sm text-foreground/90 sm:text-base">
                    ${formatMxn(p.priceMxn, locale)}
                    <span className="text-[0.7rem] text-muted-foreground">{tp("perMonth")}</span>
                  </span>
                )}
                <span className="sr-only">{t("stripSee")}</span>
                <ArrowRight
                  aria-hidden
                  className="hidden size-4 text-muted-foreground transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-fiber sm:block"
                />
              </span>
            </PlanJumpButton>
          )
        })}
        {/* Same terms for every plan; on phones they sit under the pitch, just above. */}
        <div className="hidden items-center border-l border-white/[0.07] pl-6 lg:flex">
          <PriceTerms plan={featuredPlan} inline quiet hidePendingPromo />
        </div>
      </div>
    </div>
  )
}
