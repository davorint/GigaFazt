"use client"

import { useTranslations } from "next-intl"
import { MessageCircle, Phone } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { getAddOn, getPlan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { useSelection } from "@/lib/selection"
import { telHref, whatsappHref } from "@/lib/contact"
import { track } from "@/lib/analytics"
import { ContractButton } from "./ContractButton"

const LINK =
  "inline-flex min-h-10 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/**
 * Final CTA (SPEC §8): Contratar (lead Sheet) + WhatsApp deep link prefilled
 * with the selected plan + phone. The address-check input was removed by the
 * owner; WhatsApp/phone are chips until BUSINESS.md has them.
 */
export function FinalCta() {
  const t = useTranslations("cta")
  const ta = useTranslations("addons")
  const planId = useSelection((s) => s.planId)
  const addOnIds = useSelection((s) => s.addOnIds)
  const plan = getPlan(planId)
  const speed = plan ? speedLabel(plan.downMbps) : ""
  const extras = addOnIds.filter((id) => getAddOn(id)).map((id) => ta(`${id as "tv"}.name`))
  const message = t("whatsappMessage", { speed, extras: extras.join(", ") || "none" })

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="hud-brackets relative overflow-hidden rounded-2xl surface px-6 py-12 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 max-w-xl rounded-full bg-fiber/15 blur-3xl"
        />
        <p className="eyebrow mb-3">[ {t("eyebrow")} ]</p>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">{t("title")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("lead")}</p>

        {plan && (
          <p className="mt-6 font-mono text-sm">
            <span className="text-muted-foreground">{t("selected")} </span>
            <span className="text-fiber">{t("planName", { speed })}</span>
            {extras.length > 0 && <span className="text-muted-foreground"> + {extras.join(", ")}</span>}{" "}
            <a href="#plans" className="rounded text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {t("change")}
            </a>
          </p>
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

          {isPlaceholder(company.salesPhone) ? (
            <span className={`${LINK} text-muted-foreground`}>
              <Phone className="size-4" aria-hidden />
              {t("call")}
              <PlaceholderChip keyName={company.salesPhone.key} />
            </span>
          ) : (
            <a href={telHref(company.salesPhone)} className={LINK}>
              <Phone className="size-4" aria-hidden />
              <span className="font-mono tabular-nums">{company.salesPhone}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
