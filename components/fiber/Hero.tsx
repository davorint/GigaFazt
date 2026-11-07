"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight, MapPin } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import type { Segment } from "@/lib/types"
import { lowestPrice } from "@/lib/plans"
import { isPlaceholder } from "@/lib/placeholder"
import { track } from "@/lib/analytics"
import { FiberBackdrop } from "./FiberBackdrop"

/**
 * Hero (SPEC §2): the fiber scene behind, an offer-led pitch in front. Leads
 * with the entry gigabit plan and sends visitors to the plans; the segment
 * switcher drives the subhead and price anchor.
 */
export function Hero() {
  const t = useTranslations("hero")
  const ts = useTranslations("segment")
  const [segment, setSegment] = useState<Segment>("hogar")

  const price = lowestPrice(segment)

  const goTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })

  return (
    <div className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden">
      <FiberBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pt-24 pb-16 sm:px-6">
        <p className="eyebrow">[ {t("eyebrow")} ]</p>

        <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
          {segment === "hogar" ? t("h1_hogar") : t("h1_empresa")}
        </h1>

        <div
          role="group"
          aria-label="Hogar · Empresa"
          className="mt-8 inline-flex w-fit rounded-lg border border-border bg-surface/80 p-1 font-mono text-xs backdrop-blur-sm"
        >
          {(["hogar", "empresa"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={segment === s}
              onClick={() => {
                setSegment(s)
                track("segment_switched", { segment: s })
              }}
              className={cn(
                "rounded-md px-4 py-1.5 uppercase tracking-wider transition-colors",
                segment === s
                  ? "bg-fiber text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {ts(s)}
            </button>
          ))}
        </div>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {segment === "hogar" ? t("subhead_hogar") : t("subhead_empresa")}
        </p>

        {/* Offer / price anchor: the lowest monthly price for the segment. */}
        <p className="mt-6 flex items-baseline gap-2 font-mono text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">{t("from")}</span>
          {isPlaceholder(price) ? (
            <PlaceholderChip keyName={price.key} />
          ) : (
            <span className="text-3xl font-semibold text-foreground sm:text-4xl">
              ${price.toLocaleString("es-MX")}
              <span className="ml-1 text-base text-muted-foreground">
                {t("perMonth")}
              </span>
            </span>
          )}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 font-mono text-xs tracking-wider shadow-[0_0_24px_-6px_var(--color-fiber)]"
            onClick={() => {
              track("plan_selected", { context: "hero" })
              goTo("plans")
            }}
          >
            {t("viewPlans").toUpperCase()}
            <ArrowRight />
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="h-11 gap-1.5 font-mono text-xs tracking-wider text-muted-foreground"
            onClick={() => goTo("map")}
          >
            <MapPin />
            {t("coverageLink")}
          </Button>
        </div>
      </div>
    </div>
  )
}
