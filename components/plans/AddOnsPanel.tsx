"use client"

import { useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Tv } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { addOns, getPlan, monthlyTotal, plans } from "@/lib/plans"
import { formatMxn, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { selection, useSelection } from "@/lib/selection"
import { track } from "@/lib/analytics"
import { AnimatedNumber } from "./AnimatedNumber"
import { PriceTerms } from "./PriceTerms"

/**
 * "Arma tu paquete" (SPEC §3 AddOns): pick a speed, toggle add-ons, and the
 * monthly total updates instantly. The CTA opens the lead Sheet prefilled.
 */
export function AddOnsPanel() {
  const t = useTranslations("addons")
  const tp = useTranslations("plans")
  const locale = useLocale()
  const planId = useSelection((s) => s.planId)
  const addOnIds = useSelection((s) => s.addOnIds)
  const plan = getPlan(planId) ?? plans[0]
  const total = monthlyTotal(plan.id, addOnIds)
  const money = useCallback((n: number) => `$${formatMxn(n, locale)}`, [locale])

  return (
    <div className="flex h-full flex-col rounded-xl surface p-6">
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("lead")}</p>

      <fieldset className="mt-6">
        <legend className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {t("plan")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {plans.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 font-mono text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                p.id === plan.id
                  ? "border-fiber bg-fiber/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <input
                type="radio"
                name="addons-plan"
                value={p.id}
                checked={p.id === plan.id}
                onChange={() => {
                  selection.selectPlan(p.id)
                  track("plan_selected", { planId: p.id, context: "addons" })
                }}
                className="sr-only"
              />
              {speedLabel(p.downMbps)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {t("extras")}
        </legend>
        <ul className="space-y-2">
          {addOns.map((a) => {
            const on = addOnIds.includes(a.id)
            const id = `addon-${a.id}`
            return (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  on ? "border-fiber/50 bg-fiber/5" : "border-border"
                )}
              >
                <div className="flex items-start gap-3">
                  <Tv className="mt-0.5 size-5 shrink-0 text-fiber" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-x-3 font-medium">
                      {t(`${a.id as "tv"}.name`)}
                      <span className="font-mono text-sm text-muted-foreground">
                        {isPlaceholder(a.priceMxn) ? (
                          <PlaceholderChip keyName={a.priceMxn.key} />
                        ) : (
                          t("plus", { price: formatMxn(a.priceMxn, locale) })
                        )}
                      </span>
                    </label>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t(`${a.id as "tv"}.desc`)}
                    </p>
                    {a.contents && (
                      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono">
                        {(["channels", "movies", "series"] as const).map((k) => (
                          <div key={k} className="rounded-md bg-muted/60 px-2 py-1.5">
                            <dt className="sr-only">{t(`tv.${k}`)}</dt>
                            <dd className="text-base text-foreground">
                              {formatMxn(a.contents![k], locale)}
                            </dd>
                            <dd aria-hidden className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                              {t(`tv.${k}`)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <Switch
                    id={id}
                    checked={on}
                    onCheckedChange={(checked) => {
                      selection.toggleAddOn(a.id, checked)
                      track("addon_toggled", { id: a.id, on: checked })
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div className="mt-auto pt-6">
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-border pt-5">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {t("total")}
          </span>
          <span className="flex items-baseline gap-2 font-mono">
            <AnimatedNumber
              value={total.known}
              format={money}
              className="text-3xl font-semibold text-foreground"
            />
            <span className="text-sm text-muted-foreground">{tp("perMonth")}</span>
            {total.pending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                + <PlaceholderChip keyName="addon.price" />
              </span>
            )}
          </span>
          <span className="sr-only" aria-live="polite">
            {t("total")}: {money(total.known)}
            {total.pending ? ` ${t("pending")}` : ""}
          </span>
        </div>
        <PriceTerms plan={plan} inline className="mt-2" />
        <Button
          size="lg"
          className="mt-5 h-11 w-full font-mono text-xs uppercase tracking-wider"
          onClick={() => {
            track("plan_selected", { planId: plan.id, context: "addons" })
            selection.openLead(plan.id)
          }}
        >
          {t("cta")}
        </Button>
      </div>
    </div>
  )
}
