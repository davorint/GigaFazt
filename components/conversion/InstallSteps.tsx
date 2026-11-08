import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { plans } from "@/lib/plans"
import { feeLabel, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { ContractButton } from "./ContractButton"
import { statesInList } from "@/lib/geo/state-names"
import { InView } from "@/components/layout/InView"

/**
 * How installation works (SPEC §7). The owner removed the address check, so
 * step 1 points to the coverage map and the exact address is confirmed in
 * step 3 (lead form). Install time/fee are BUSINESS.md values (chips if unset).
 *
 * A fiber rail runs through the step numbers (horizontal from md, vertical on
 * phones): it lights up 01→04 once when the list scrolls into view, then a
 * slow light packet travels along it while visible (`.install-*` in
 * globals.css; lit and still under reduced motion / paused animations).
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

      <InView
        as="ol"
        className="install-steps mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] shadow-[0_32px_64px_-32px_rgb(0_0_0_/_0.9)] md:grid-cols-2 lg:grid-cols-4"
      >
        {steps.map((s, i) => (
          <li
            key={s.id}
            style={{ "--i": i } as React.CSSProperties}
            className="surface-cell relative flex flex-col gap-3 py-6 pr-6 pl-[4.5rem] md:pl-6"
          >
            <span aria-hidden className="install-rail">
              <span className="install-rail-lit" />
              <span className="install-packet"><span className="install-packet-dot" /></span>
            </span>
            <span
              className="install-node relative z-10 grid size-8 place-items-center rounded-full font-mono text-[0.7rem] tabular-nums max-md:absolute max-md:top-6 max-md:left-6"
              aria-hidden
            >
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
                      feeLabel(installFeeMxn, locale, t("plans.free"))
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </InView>

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
