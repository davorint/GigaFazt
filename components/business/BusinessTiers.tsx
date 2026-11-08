import { useTranslations } from "next-intl"
import { INTERNET_TIERS } from "@/lib/business"
import { QuoteButton } from "./QuoteButton"

/**
 * The three internet packages side by side (lib/business INTERNET_TIERS):
 * same speed choice in each, different availability. Datasheet rows, no
 * prices; the uptime row appears only where there is an SLA (Dedicado).
 */
export function BusinessTiers() {
  const t = useTranslations("business.tiers")

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("eyebrow")}
          </p>
          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{t("title")}</h2>
        </div>
        <p className="max-w-md text-zinc-400 lg:justify-self-end">{t("lead")}</p>
      </div>

      <ul className="reveal-stagger mt-16 grid gap-6 lg:grid-cols-3">
        {INTERNET_TIERS.map((tier, i) => {
          const rows: { label: string; value: string; strong?: boolean }[] = [
            { label: t("speedLabel"), value: t("speedValue") },
            ...(tier.uptimePct !== null
              ? [{ label: t("uptimeLabel"), value: t("uptimeValue", { pct: tier.uptimePct }), strong: true }]
              : []),
            {
              label: t("bandwidthLabel"),
              value: t(`bandwidth.${tier.bandwidth}`),
            },
            { label: t("supportLabel"), value: t(`support.${tier.support}`) },
            ...(tier.backupRoute ? [{ label: t("extraLabel"), value: t("backupRoute") }] : []),
          ]
          return (
            <li key={tier.id} className={`flex flex-col p-6 sm:p-8 ${i === 0 ? "biz-frame" : "border border-[var(--biz-line)]"}`}>
              <p className="font-mono text-sm tabular-nums text-[var(--biz-accent)]" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-2xl font-medium tracking-[-0.02em] text-white">{t(`items.${tier.id}.name`)}</h3>
              <p className="mt-2 text-sm text-zinc-400">{t(`items.${tier.id}.tagline`)}</p>
              <dl className="mt-8 flex-1 border-t border-[var(--biz-line)]">
                {rows.map((r) => (
                  <div key={r.label} className="grid gap-1 border-b border-[var(--biz-line)] py-4">
                    <dt className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">{r.label}</dt>
                    <dd className={r.strong ? "font-mono text-lg tabular-nums text-white" : "text-zinc-200"}>{r.value}</dd>
                  </div>
                ))}
              </dl>
              <QuoteButton
                context={`business_tier_${tier.id}`}
                message={t("whatsappMessage", { tier: t(`items.${tier.id}.name`) })}
                className="mt-8 w-full"
              />
            </li>
          )
        })}
      </ul>
      <p className="reveal mt-8 max-w-2xl text-sm text-zinc-400">{t("note")}</p>
    </div>
  )
}
