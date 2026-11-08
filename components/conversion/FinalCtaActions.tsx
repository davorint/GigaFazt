"use client"

import { useLocale, useTranslations } from "next-intl"
import { MessageCircle, Phone } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { PriceTerms } from "@/components/plans/PriceTerms"
import { company } from "@/lib/company"
import { getAddOn, getPlan, monthlyTotal } from "@/lib/plans"
import { RollingNumber } from "@/components/plans/RollingNumber"
import { formatMxn, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { useSelection } from "@/lib/selection"
import { telHref, whatsappHref } from "@/lib/contact"
import { track } from "@/lib/analytics"
import { ContractButton } from "./ContractButton"

const LINK =
  "inline-flex min-h-11 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-white/12 bg-background/60 px-4 py-2 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/**
 * Final CTA client island: the selected plan as a "ticket" (speed, monthly
 * total with add-ons, terms next to the price per hard rule #5) and the three
 * actions: Contratar (lead Sheet), WhatsApp deep link prefilled with the
 * selection, phone. WhatsApp/phone are chips until BUSINESS.md has them.
 */
export function FinalCtaActions() {
  const t = useTranslations("cta")
  const ta = useTranslations("addons")
  const tp = useTranslations("plans")
  const locale = useLocale()
  const planId = useSelection((s) => s.planId)
  const addOnIds = useSelection((s) => s.addOnIds)
  const plan = getPlan(planId)
  const speed = plan ? speedLabel(plan.downMbps) : ""
  const extras = addOnIds.filter((id) => getAddOn(id)).map((id) => ta(`${id as "tv"}.name`))
  const message = t("whatsappMessage", { speed, extras: extras.join(", ") || "none" })
  const total = plan ? monthlyTotal(plan.id, addOnIds) : null

  return (
    <>
      {plan && total && (
        <div className="finale-ticket hud-brackets relative mx-auto mt-10 w-full max-w-md rounded-xl border border-white/10 bg-surface/80 px-5 py-4 text-left shadow-[0_0_60px_-24px_var(--color-fiber)] sm:px-6">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            <span>{t("selected")}</span>
            <a
              href="#plans"
              className="rounded normal-case tracking-normal underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("change")}
            </a>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-mono text-lg text-fiber">
              {t("planName", { speed })}
              {extras.length > 0 && <span className="text-muted-foreground"> + {extras.join(", ")}</span>}
            </p>
            <p className="flex items-baseline gap-1.5 font-mono">
              <RollingNumber text={`$${formatMxn(total.known, locale)}`} className="text-3xl font-semibold text-foreground" />
              <span className="sr-only">${formatMxn(total.known, locale)}</span>
              <span className="text-sm text-muted-foreground">{tp("perMonth")}</span>
              {total.pending && <PlaceholderChip keyName="addon.price" />}
            </p>
          </div>
          <PriceTerms plan={plan} inline quiet className="mt-3 border-t border-white/10 pt-3" />
        </div>
      )}

      <div className="mx-auto mt-8 flex max-w-sm flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
        <ContractButton context="final_cta" />

        {isPlaceholder(company.whatsapp) ? (
          <span className={`${LINK} text-muted-foreground`}>
            <MessageCircle className="size-4" aria-hidden />
            {t("whatsapp")}
            <PlaceholderChip keyName={company.whatsapp.key} />
          </span>
        ) : (
          <a
            href={whatsappHref(company.whatsapp, message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_clicked", { context: "final_cta", planId })}
            className={`${LINK} text-ok`}
          >
            <MessageCircle className="size-4" aria-hidden />
            {t("whatsapp")}
          </a>
        )}

        {/* The phone action appears once SALES_PHONE is set (BUSINESS.md); until
            then WhatsApp is the direct line. The footer still shows the chip. */}
        {isPlaceholder(company.salesPhone) ? null : (
          <a href={telHref(company.salesPhone)} className={LINK}>
            <Phone className="size-4" aria-hidden />
            <span className="font-mono tabular-nums">{company.salesPhone}</span>
          </a>
        )}
      </div>
    </>
  )
}
