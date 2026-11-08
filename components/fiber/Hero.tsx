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
export function Hero() {
  const t = useTranslations("hero")
  const locale = useLocale()
  const featuredPrice = featuredPlan.priceMxn

  const goTo = (id: string) => scrollToId(id)

  return (
    <div className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden">
      <FiberBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pt-24 pb-16 sm:px-6">
        <p className="eyebrow">[ {t("eyebrow")} ]</p>

        <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
          {isPlaceholder(featuredPrice)
            ? t("h1NoPrice")
            : t("h1", { price: formatMxn(featuredPrice, locale) })}
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {t("subhead")}
        </p>

        {/* Hard rule #5: the H1 price's fee, term and promo, right under the pitch. */}
        <PriceTerms plan={featuredPlan} inline className="mt-5" />

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
