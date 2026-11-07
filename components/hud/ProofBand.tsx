import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { PlaceholderChip } from "./PlaceholderChip"
import { UptimeBar } from "./UptimeBar"
import { Testimonials } from "./Testimonials"
import { company } from "@/lib/company"
import { plans } from "@/lib/plans"
import { formatSpeed } from "@/lib/format"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"

/**
 * Proof band (SPEC §6). Only claims we can back: the qualified metro latency,
 * the top plan speed from lib/plans.ts, and BUSINESS.md network figures (POR
 * DEFINIR chips until filled). The Dedicado 99.999% SLA and "10 Gbps" were
 * dropped with the owner's single lineup. Uptime + testimonials render only
 * with real data.
 */
export function ProofBand() {
  const t = useTranslations()
  const locale = useLocale()
  const top = formatSpeed(Math.max(...plans.map((p) => p.downMbps)))
  const { kmFiber, pops, clients, monitoring24h } = company.network

  const figure = (v: Maybe<number>) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} className="text-xs" /> : v.toLocaleString(locale)

  const stats = [
    { value: <>{t("proof.latencyValue")}<sup className="text-fiber">*</sup></>, label: t("proof.latency") },
    { value: <>{top.value} {top.unit}</>, label: t("proof.speed") },
    { value: figure(kmFiber), label: t("proof.km") },
    { value: figure(pops), label: t("proof.pops") },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("sections.proof")} ]</p>
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        {t("sectionHeads.proof")}
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("proof.lead")}</p>

      <div className="mt-10 flex flex-wrap gap-x-16 gap-y-6">
        {!isPlaceholder(clients) && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-fiber sm:text-6xl">
              {t("proof.clientsValue", { count: clients.toLocaleString(locale) })}
            </span>
            <span className="text-lg text-muted-foreground">{t("proof.clients")}</span>
          </p>
        )}
        {monitoring24h === true && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-fiber sm:text-6xl">
              {t("proof.monitorValue")}
            </span>
            <span className="max-w-xs text-lg text-muted-foreground">{t("proof.monitor")}</span>
          </p>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-2 bg-surface px-5 py-6">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="flex min-h-9 items-center font-mono text-2xl tabular-nums tracking-tight sm:text-3xl">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">* {t("proof.latencyNote")}</p>

      <div className="mt-8 space-y-8">
        <UptimeBar />
        <Testimonials />
      </div>

      <div className="mt-10 flex justify-center">
        <a
          href="#fiber"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("proof.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  )
}
