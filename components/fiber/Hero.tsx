"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, MapPin, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { featuredPlan } from "@/lib/plans"
import { company } from "@/lib/company"
import { formatMxn } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { track } from "@/lib/analytics"
import { scrollToId } from "@/lib/scroll"
import { PriceTerms } from "@/components/plans/PriceTerms"
import { FiberBackdrop } from "./FiberBackdrop"

/**
 * Hero (SPEC §2): the fiber scene behind, an offer-led pitch in front. One
 * price only, the featured gigabit plan in the H1, with its terms right under
 * the pitch (hard rule #5); the lineup's other prices live in Plans and the
 * Wi-Fi 7 modem in the 1 Gbps plan card. One lineup for everyone.
 */
const H1_CLASS =
  "block text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[5.5rem]"

export function Hero() {
  const t = useTranslations("hero")
  const locale = useLocale()
  const featuredPrice = featuredPlan.priceMxn

  const goTo = (id: string) => scrollToId(id)
  const headline = (brand: boolean) =>
    isPlaceholder(featuredPrice)
      ? t("h1NoPrice")
      : t.rich("h1", {
          price: formatMxn(featuredPrice, locale),
          hl: (chunks) => <span className={brand ? "text-brand" : undefined}>{chunks}</span>,
        })

  return (
    <div className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden">
      <FiberBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pt-24 pb-16 sm:px-6">
        <p className="eyebrow">[ {t("eyebrow")} ]</p>

        {/* The headline plus an aria-hidden copy on top that carries a band of
            light sweeping right → left, from the node (globals.css .hero-sweep:
            off under reduced motion, paused animations and screenshots). */}
        <div className="relative mt-5 max-w-4xl">
          <h1 className={H1_CLASS}>{headline(true)}</h1>
          <span aria-hidden className={`hero-sweep pointer-events-none absolute inset-0 ${H1_CLASS}`}>
            {headline(false)}
          </span>
        </div>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {t("subhead")}
        </p>

        {/* Hard rule #5: the H1 price's fee and term right under the pitch (the
            promo chip waits in Plans until BUSINESS.md sets it). */}
        <PriceTerms plan={featuredPlan} inline hidePendingPromo className="mt-5" />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 font-mono text-xs tracking-wider shadow-[0_0_24px_-6px_var(--color-fiber)]"
            onClick={() => {
              track("plan_selected", { planId: featuredPlan.id, context: "hero" })
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

        {!isPlaceholder(company.network.clients) && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4 text-ok" aria-hidden />
            {t("clients", { count: company.network.clients.toLocaleString(locale) })}
          </p>
        )}
      </div>
    </div>
  )
}
