"use client"

import { useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { PackagePlus, Tv } from "lucide-react"
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
 * Wide screens: one horizontal ticket, the stub on the right behind a
 * vertical perforation (.ticket-stub-side).
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl surface lg:flex-row">
      <div className="p-5 sm:p-7 lg:flex-1">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-fiber/30 bg-fiber/10">
          <PackagePlus className="size-[18px] text-fiber" aria-hidden />
        </span>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("lead")}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <fieldset>
        <legend className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {t("plan")}
        </legend>
        <div className="grid grid-cols-3 gap-2.5">
          {plans.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3.5 font-mono transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                p.id === plan.id
                  ? "border-fiber/70 bg-fiber/10 text-foreground shadow-[0_0_24px_-10px_var(--color-fiber)]"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25 hover:text-foreground"
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
              <span className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl">{speedLabel(p.downMbps)}</span>
              <span className="text-[0.6rem] uppercase tracking-wider opacity-70">↓↑ {tp("symmetric")}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
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
                  "rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200",
                  on ? "border-fiber/60 bg-fiber/[0.07] shadow-[0_0_24px_-12px_var(--color-fiber)]" : "border-white/10 bg-white/[0.02]"
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
      </div>

      </div>

      {/* The "ticket": a perforated stub with the live total (hard rule #5 terms under it). */}
      <div className="ticket-stub ticket-stub-side mt-auto px-5 pt-6 pb-5 sm:px-7 sm:pb-7 lg:mt-0 lg:flex lg:w-[25rem] lg:shrink-0 lg:flex-col lg:justify-center lg:py-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {t("total")}
          </span>
          <span className="flex items-baseline gap-2 font-mono">
            <AnimatedNumber
              value={total.known}
              format={money}
              className="text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl"
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
