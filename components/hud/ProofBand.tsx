import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { CountUp } from "@/components/layout/CountUp"
import { UptimeBar } from "./UptimeBar"
import { Testimonials } from "./Testimonials"
import { company } from "@/lib/company"
import { plans } from "@/lib/plans"
import { formatSpeed } from "@/lib/format"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"

/**
 * Proof band (SPEC §6). Only claims we can back: the qualified metro latency,
 * the top plan speed from lib/plans.ts, and BUSINESS.md network figures (km,
 * POPs: shown once filled). The Dedicado 99.999% SLA and "10 Gbps" were
 * dropped with the owner's single lineup. Uptime + testimonials render only
 * with real data.
 *
 * Layout: the one full-bleed "statement" band of the page. Real figures
 * (clients, 24 h monitoring, top speed) are set huge across the width, lit by
 * one fiber line, and count up once on first view; the qualified figures
 * follow in a quiet row.
 */
export function ProofBand() {
  const t = useTranslations()
  const locale = useLocale()
  const top = formatSpeed(Math.max(...plans.map((p) => p.downMbps)))
  const { kmFiber, pops, clients, monitoring24h } = company.network


  const big = [
    !isPlaceholder(clients) && {
      key: "clients",
      value: t("proof.clientsValue", { count: clients.toLocaleString(locale) }),
      unit: null,
      label: t("proof.clients"),
    },
    // "24 h" → big "24" + small "h" (the unit is split off the message value).
    monitoring24h === true && {
      key: "monitor",
      value: t("proof.monitorValue").split(" ")[0],
      unit: t("proof.monitorValue").split(" ").slice(1).join(" ") || null,
      label: t("proof.monitor"),
    },
    { key: "speed", value: String(top.value), unit: top.unit, label: t("proof.speed") },
  ].filter((x): x is { key: string; value: string; unit: string | null; label: string } => Boolean(x))

  // Secondary figures show once BUSINESS.md fills them (still-open values
  // are listed in PROGRESS.md "Open questions"); a row of POR DEFINIR chips
  // under the headline figures read as unfinished.
  type Stat = { value: React.ReactNode; label: string }
  const known = (v: Maybe<number>, label: string): Stat[] =>
    isPlaceholder(v) ? [] : [{ value: v.toLocaleString(locale), label }]
  const stats: Stat[] = [
    { value: <>{t("proof.latencyValue")}<sup className="text-fiber">*</sup></>, label: t("proof.latency") },
    ...known(kmFiber, t("proof.km")),
    ...known(pops, t("proof.pops")),
  ]

  return (
    <div className="proof-band relative overflow-hidden py-24 sm:py-32">
      <div className="reveal mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-2 lg:items-end lg:gap-16">
        <div>
          <p className="eyebrow mb-3">[ {t("sections.proof")} ]</p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            {t("sectionHeads.proof")}
          </h2>
        </div>
        <p className="max-w-md text-muted-foreground lg:justify-self-end">{t("proof.lead")}</p>
      </div>

      {/* Full-bleed statement row: one fiber line runs edge to edge above the figures. */}
      <div className="relative mt-16 sm:mt-20">
        <div aria-hidden className="proof-line absolute inset-x-0 top-0 h-px" />
        <ul
          className="reveal-stagger mx-auto grid max-w-7xl px-4 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:px-6"
          style={{ "--n": big.length } as React.CSSProperties}
        >
          {big.map((b) => (
            <li key={b.key} className="relative pt-10 pb-2 sm:pt-12 sm:pr-6">
              <span aria-hidden className="absolute top-0 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fiber shadow-[0_0_0_4px_rgb(6_182_212_/_0.15),0_0_18px_var(--color-fiber)] max-sm:hidden" />
              <p className="flex items-baseline gap-3 font-mono">
                <span className="proof-figure text-[clamp(4.5rem,10vw,9.5rem)] leading-[0.9] font-semibold tracking-[-0.06em] tabular-nums">
                  <CountUp text={b.value} />
                </span>
                {b.unit && <span className="text-2xl font-medium text-fiber sm:text-3xl">{b.unit}</span>}
              </p>
              <p className="mt-4 max-w-[17rem] text-base text-muted-foreground sm:text-lg">{b.label}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <dl
          className="reveal grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] sm:grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:max-w-[calc(var(--n)*26rem)]"
          style={{ "--n": stats.length } as React.CSSProperties}
        >
          {stats.map((s) => (
            <div key={s.label} className="surface-cell flex flex-col-reverse gap-1.5 px-5 py-5">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="flex min-h-8 items-center font-mono text-2xl tabular-nums tracking-tight">{s.value}</dd>
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
    </div>
  )
}
