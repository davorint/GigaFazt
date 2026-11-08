import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { plans } from "@/lib/plans"
import { feeLabel, speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { ContractButton } from "./ContractButton"
import { InView } from "@/components/layout/InView"
import { RevealHeading } from "@/components/layout/RevealHeading"

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
    { id: "zone", body: t("install.steps.zone.body", { area: t("coverage.area") }) },
    { id: "plan", body: t("install.steps.plan.body", { speeds: or.format(plans.map((p) => speedLabel(p.downMbps))) }) },
    { id: "visit", body: t("install.steps.visit.body") },
    { id: "live", body: t("install.steps.live.body") },
  ] as const

  return (
    <div className="section-pad mx-auto max-w-7xl px-4 sm:px-6">
      <div>
      <p className="eyebrow mb-3">[ {t("sections.install")} ]</p>
      <RevealHeading className="display-2 max-w-4xl">{t("sectionHeads.install")}</RevealHeading>
      <p className="section-lead reveal">{t("install.lead")}</p>
      </div>

      <InView
        as="ol"
        className="install-steps reveal mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] shadow-[0_32px_64px_-32px_rgb(0_0_0_/_0.9)] md:grid-cols-2 lg:grid-cols-4"
      >
        {steps.map((s, i) => (
          <li
            key={s.id}
            style={{ "--i": i } as React.CSSProperties}
            className="surface-cell relative flex flex-col gap-3 overflow-hidden py-8 pr-8 pl-[5.25rem] md:pl-8"
          >
            <span aria-hidden className="install-rail">
              <span className="install-rail-lit" />
              <span className="install-packet"><span className="install-packet-dot" /></span>
            </span>
            <span
              className="install-node relative z-10 grid size-11 place-items-center rounded-full font-mono text-sm tabular-nums max-md:absolute max-md:top-8 max-md:left-8"
              aria-hidden
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* Oversized outlined step number: decorative watermark. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-2 -bottom-6 font-mono text-[7.5rem] leading-none font-semibold tracking-[-0.08em] text-transparent [-webkit-text-stroke:1px_rgb(103_232_249/0.13)]"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 text-lg font-semibold">{t(`install.steps.${s.id}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
            {s.id === "zone" && (
              <a href="#map" className="mt-auto inline-flex items-center gap-1 self-start rounded text-sm text-foreground/80 underline decoration-white/25 underline-offset-4 transition-colors hover:text-foreground hover:decoration-white/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("install.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  )
}
