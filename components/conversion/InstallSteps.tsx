import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { plans } from "@/lib/plans"
import { formatMxn, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { ContractButton } from "./ContractButton"
import { statesInList } from "@/lib/geo/state-names"

/**
 * How installation works (SPEC §7). The owner removed the address check, so
 * step 1 points to the coverage map and the exact address is confirmed in
 * step 3 (lead form). Install time/fee are BUSINESS.md values (chips if unset).
 */
export function InstallSteps() {
  const t = useTranslations()
  const locale = useLocale()
  const or = new Intl.ListFormat(locale, { type: "disjunction" })
  const { installDays, installFeeMxn } = company.terms

  const steps = [
    { id: "zone", body: t("install.steps.zone.body", { states: statesInList((k) => t(`states.${k}`), locale) }) },
    { id: "plan", body: t("install.steps.plan.body", { speeds: or.format(plans.map((p) => speedLabel(p.downMbps))) }) },
    { id: "visit", body: t("install.steps.visit.body") },
    { id: "live", body: t("install.steps.live.body") },
  ] as const

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("sections.install")} ]</p>
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        {t("sectionHeads.install")}
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("install.lead")}</p>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-3 bg-surface p-6">
            <span className="font-mono text-xs tabular-nums text-fiber" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-semibold">{t(`install.steps.${s.id}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
            {s.id === "zone" && (
              <a href="#map" className="mt-auto inline-flex items-center gap-1 self-start rounded text-sm text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {t("install.steps.zone.link")}
                <ArrowRight className="size-3.5" aria-hidden />
              </a>
            )}
            {s.id === "live" && (
              <dl className="mt-auto space-y-1.5 font-mono text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-muted-foreground">{t("install.time")}</dt>
                  <dd>{isPlaceholder(installDays) ? <PlaceholderChip keyName={installDays.key} /> : installDays}</dd>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-muted-foreground">{t("install.fee")}</dt>
                  <dd>
                    {isPlaceholder(installFeeMxn) ? (
                      <PlaceholderChip keyName={installFeeMxn.key} />
                    ) : (
                      `$${formatMxn(installFeeMxn, locale)} MXN`
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <ContractButton context="install" />
        <a
          href="#plans"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("install.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  )
}
