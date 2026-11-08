"use client"

import { useState } from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocale, useTranslations } from "next-intl"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { PriceTerms } from "@/components/plans/PriceTerms"
import { addOns, getPlan, monthlyTotal, plans } from "@/lib/plans"
import { formatMxn, speedLabel } from "@/lib/format"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { company } from "@/lib/company"
import { leadSchema, todayInMexico, type Lead, type LeadInput } from "@/lib/lead"
import { selection } from "@/lib/selection"
import { track } from "@/lib/analytics"

type Status = "idle" | "sending" | "sent" | "error"

/**
 * Contract/lead form (SPEC "Conversion"): name, WhatsApp/phone, email, address,
 * plan + add-ons (prefilled), preferred date, privacy consent and a honeypot.
 * Validates with the same zod schema as /api/leads.
 */
export function LeadForm({
  planId,
  addOnIds,
  onDone,
}: {
  planId: string
  addOnIds: string[]
  onDone: () => void
}) {
  const t = useTranslations("lead")
  const ta = useTranslations("addons")
  const tp = useTranslations("plans")
  const locale = useLocale()
  const [status, setStatus] = useState<Status>("idle")
  /** Site paths ("/aviso-de-privacidad") get the locale prefix; absolute URLs pass through. */
  const localHref = (v: string) => (v.startsWith("/") ? `/${locale}${v}` : v)
  const legalValue = (v: Maybe<string>) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} /> : <span className="text-foreground">{v}</span>

  // zod messages are i18n keys (lib/lead.ts); translate them for display.
  const base = zodResolver(leadSchema) as Resolver<LeadInput, unknown, Lead>
  const resolver: Resolver<LeadInput, unknown, Lead> = async (...args) => {
    const r = await base(...args)
    for (const err of Object.values(r.errors)) {
      if (err && typeof err.message === "string" && err.message) {
        err.message = t(`errors.${err.message}` as "errors.name")
      }
    }
    return r
  }

  const form = useForm<LeadInput, unknown, Lead>({
    resolver,
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      planId,
      addOnIds,
      preferredDate: "",
      consent: false as unknown as true, // unchecked until the user consents
      website: "",
    },
  })

  const watchedPlan = useWatch({ control: form.control, name: "planId" })
  const watchedAddOns = useWatch({ control: form.control, name: "addOnIds" })
  const plan = getPlan(watchedPlan) ?? plans[0]
  const total = monthlyTotal(plan.id, watchedAddOns)
  const today = todayInMexico()

  const onSubmit = async (lead: Lead) => {
    setStatus("sending")
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      })
      if (!res.ok) throw new Error(String(res.status))
      track("lead_submitted", { planId: lead.planId, addOnIds: lead.addOnIds })
      selection.selectPlan(lead.planId)
      selection.setAddOns(lead.addOnIds)
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="flex flex-col items-start gap-3 px-4 py-6">
        <CheckCircle2 className="size-8 text-ok" aria-hidden />
        <p className="text-lg font-semibold">{t("successTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("successBody")}</p>
        <Button variant="outline" className="mt-4" onClick={onDone}>
          {t("close")}
        </Button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5 px-4 pb-6"
      >
        {/* Bundle summary with live total and all price terms. */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {t("summary")}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-2 font-mono">
            <span className="text-lg text-foreground">{speedLabel(plan.downMbps)}</span>
            {watchedAddOns.map((id) => (
              <span key={id} className="text-sm text-muted-foreground">
                + {ta(`${id as "tv"}.name`)}
              </span>
            ))}
            <span className="ml-auto text-xl font-semibold text-foreground">
              ${formatMxn(total.known, locale)}
              <span className="text-sm font-normal text-muted-foreground">{tp("perMonth")}</span>
            </span>
            {total.pending && <PlaceholderChip keyName="addon.price" />}
          </p>
          <PriceTerms plan={plan} inline className="mt-2" />
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="planId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("plan")}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                  items={plans.map((p) => ({ value: p.id, label: speedLabel(p.downMbps) }))}
                >
                  <FormControl>
                    <SelectTrigger className="w-full font-mono">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="font-mono">
                        {speedLabel(p.downMbps)}
                        {!isPlaceholder(p.priceMxn) && ` · $${formatMxn(p.priceMxn, locale)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="addOnIds"
            render={({ field }) => (
              <FormItem>
                <fieldset>
                <legend className="mb-2 text-sm font-medium">{t("extras")}</legend>
                <div className="flex min-h-9 flex-wrap items-center gap-4">
                  {addOns.map((a) => {
                    const checked = field.value.includes(a.id as "tv")
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(on) =>
                            field.onChange(
                              on
                                ? [...field.value, a.id]
                                : field.value.filter((x) => x !== a.id)
                            )
                          }
                        />
                        {ta(`${a.id as "tv"}.name`)}
                        {!isPlaceholder(a.priceMxn) && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {ta("plus", { price: formatMxn(a.priceMxn, locale) })}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
                </fieldset>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("phone")}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" autoComplete="tel" {...field} />
                </FormControl>
                <FormDescription className="text-xs">{t("phoneHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("address")}</FormLabel>
              <FormControl>
                <Input autoComplete="street-address" {...field} />
              </FormControl>
              <FormDescription className="text-xs">{t("addressHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferredDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("date")}</FormLabel>
              <FormControl>
                <Input type="date" min={today} className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Honeypot: off-screen, not focusable, ignored by humans. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            {t("honeypot")}
            <input tabIndex={-1} autoComplete="off" {...form.register("website")} />
          </label>
        </div>

        {/* LFPDPPP art. 16-II: data collected online needs the simplified notice
            (identity, data, purposes, how to opt out) plus a link to the full one. */}
        <p className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
          {t.rich("simplified", {
            name: company.name as string,
            entity: () => legalValue(company.legal.entityName),
            address: () => legalValue(company.legal.address),
            email: () => legalValue(company.legal.privacyEmail),
          })}{" "}
          {!isPlaceholder(company.legal.privacyUrl) && (
            <a
              href={localHref(company.legal.privacyUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fiber underline underline-offset-4"
            >
              {t("readFull")}
            </a>
          )}
        </p>

        <FormField
          control={form.control}
          name="consent"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-start gap-2.5 text-sm">
                <FormControl>
                  <Checkbox
                    className="mt-0.5"
                    checked={field.value === true}
                    onCheckedChange={(on) => field.onChange(on === true)}
                  />
                </FormControl>
                <span className="flex flex-wrap items-center gap-1.5">
                  {t("consent")}{" "}
                  {isPlaceholder(company.legal.privacyUrl) ? (
                    <>
                      <span className="font-medium">{t("privacy")}</span>
                      <PlaceholderChip keyName={company.legal.privacyUrl.key} />
                    </>
                  ) : (
                    <a
                      href={localHref(company.legal.privacyUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-4"
                    >
                      {t("privacy")}
                    </a>
                  )}
                </span>
              </label>
              <FormMessage />
            </FormItem>
          )}
        />

        {status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t("error")}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={status === "sending"}
          className="h-11 font-mono text-xs uppercase tracking-wider"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              {t("sending")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </form>
    </Form>
  )
}
