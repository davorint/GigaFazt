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
import { SpeedBars } from "./SpeedBars"

/**
 * Plan card (SPEC §3): speed is the hero number, then the price block with all
 * terms visible, includes, and the "Contratar" CTA that opens the lead Sheet.
 */
export function PlanCard({ plan, maxMbps }: { plan: Plan; maxMbps: number }) {
  const t = useTranslations("plans")
  const selected = useSelection((s) => s.planId === plan.id)
  const speed = formatSpeed(plan.downMbps)
  const headingId = `plan-${plan.id}`
  const ref = useRef<HTMLElement>(null)

  // The featured border animates a gradient angle, which repaints every frame:
  // only run it while the card is on screen (globals.css pauses it otherwise).
  useEffect(() => {
    const el = ref.current
    if (!el || !plan.highlight) return
    const io = new IntersectionObserver(([e]) => {
      el.toggleAttribute("data-inview", e.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [plan.highlight])

  return (
    <article
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        "relative flex flex-col rounded-xl border bg-surface p-6 transition-colors",
        plan.highlight ? "plan-featured hud-brackets border-transparent" : "border-border",
        selected && !plan.highlight && "border-fiber/40"
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 rounded-full border border-fiber/50 bg-background px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-fiber">
          {t("popular")}
        </span>
      )}

      <h3 id={headingId} className="flex items-baseline gap-2 font-mono">
        <span className="text-6xl font-semibold tracking-[-0.04em] text-foreground">
          {speed.value}
        </span>
        <span className="text-lg text-muted-foreground">{speed.unit}</span>
      </h3>
      <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
        {t("symmetric")} · ↓ {formatSpeed(plan.downMbps).value} / ↑ {formatSpeed(plan.upMbps).value} {speed.unit}
      </p>

      <div className="mt-4">
        <SpeedBars downMbps={plan.downMbps} upMbps={plan.upMbps} maxMbps={maxMbps} />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <PriceTag plan={plan} />
        <PriceTerms plan={plan} className="mt-3" />
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
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                {item}
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
    </article>
  )
}
