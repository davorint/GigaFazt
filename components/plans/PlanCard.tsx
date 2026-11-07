"use client"

import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Check } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { formatSpeed, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { selection, useSelection } from "@/lib/selection"
import { track } from "@/lib/analytics"
import type { Plan } from "@/lib/types"
import { PriceTag } from "./PriceTag"
import { PriceTerms } from "./PriceTerms"
import { SpeedMeter } from "./SpeedMeter"
import { PlanLight } from "./PlanLight"

/**
 * Plan card (SPEC §3). Hierarchy: light chamber (tier at a glance) → speed →
 * who it suits → linear ↓/↑ meter → price with its terms (hard rule #5, set
 * quietly) → includes → "Contratar" (opens the lead Sheet).
 */
/** `level` keeps the outline valid: h2 when the cards sit directly under the page h1. */
export function PlanCard({ plan, maxMbps, level = "h3" }: { plan: Plan; maxMbps: number; level?: "h2" | "h3" }) {
  const t = useTranslations("plans")
  const selected = useSelection((s) => s.planId === plan.id)
  const speed = formatSpeed(plan.downMbps)
  const headingId = `plan-${plan.id}`
  const Heading = level
  const ref = useRef<HTMLElement>(null)

  // The light pulses and the featured border repaint every frame: only run
  // them while the card is on screen (globals.css pauses them otherwise).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      el.toggleAttribute("data-inview", e.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const ratio = plan.downMbps / maxMbps

  return (
    <article
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        "plan-card relative flex flex-col overflow-hidden rounded-2xl transition-transform duration-200",
        plan.highlight ? "plan-featured hud-brackets border border-transparent md:-translate-y-4" : "surface hover:-translate-y-1",
        selected && !plan.highlight && "ring-1 ring-fiber/50"
      )}
    >
      <div className="relative h-28 overflow-hidden border-b border-white/[0.06]">
        <PlanLight ratio={ratio} />
        {/* Plain overlay instead of mask-image: no per-frame recomposite of the moving layer. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-surface" />
        {plan.highlight && (
          <span className="absolute top-3 right-4 rounded-full border border-fiber/50 bg-background px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-fiber">
            {t("popular")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-6 pt-5 pb-6">
      <Heading id={headingId} className="flex items-baseline gap-2 font-mono">
        <span className={cn("text-7xl font-semibold tracking-[-0.05em] text-foreground", plan.highlight && "bg-gradient-to-b from-white to-cyan-200 bg-clip-text text-transparent")}>
          {speed.value}
        </span>
        <span className="text-xl text-muted-foreground">{speed.unit}</span>
      </Heading>
      <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
        {t("symmetric")} · ↓ {formatSpeed(plan.downMbps).value} / ↑ {formatSpeed(plan.upMbps).value} {speed.unit}
      </p>
      <p className="mt-3 min-h-10 text-sm leading-snug text-foreground/85">{t(`fit.${plan.id}`)}</p>

      <div className="mt-4">
        <SpeedMeter downMbps={plan.downMbps} upMbps={plan.upMbps} maxMbps={maxMbps} />
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <PriceTag plan={plan} />
        <PriceTerms plan={plan} inline quiet className="mt-2" />
      </div>

      <div className="mt-5 flex-1">
        <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {t("includes")}
        </p>
        {isPlaceholder(plan.includes) ? (
          <PlaceholderChip keyName={plan.includes.key} />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {plan.includes.map((item) => (
              <li key={item} className="flex items-start gap-2 font-medium text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                {t(`include.${item}`)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        size="lg"
        variant={plan.highlight ? "default" : "outline"}
        className={cn(
          "mt-6 h-11 w-full font-mono text-xs uppercase tracking-wider",
          plan.highlight && "shadow-[0_0_24px_-6px_var(--color-fiber)]"
        )}
        aria-label={t("contractAria", { speed: speedLabel(plan.downMbps) })}
        onClick={() => {
          track("plan_selected", { planId: plan.id, context: "card" })
          selection.openLead(plan.id)
        }}
      >
        {t("contract")}
      </Button>
      </div>
    </article>
  )
}
