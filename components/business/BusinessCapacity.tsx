import { useTranslations } from "next-intl"
import { Briefcase, Building, Store, Warehouse } from "lucide-react"
import { business } from "@/lib/business"
import { InView } from "@/components/layout/InView"
import { ChapterMark } from "./ChapterMark"

const SPACE_ICONS = { offices: Briefcase, warehouses: Warehouse, retail: Store, buildings: Building } as const

/**
 * Capacity: the dedicated-link ceiling as one display figure over a precision
 * ruler (0 → max, fills once on first view), then the spaces we connect.
 * Only owner-confirmed facts: "hasta {max} Gbps", qualified as the contracted
 * link's maximum, in any package (the packages differ by availability:
 * BusinessTiers); no prices.
 */
export function BusinessCapacity() {
  const t = useTranslations("business")
  const max = business.maxLinkGbps
  const ticks = Array.from({ length: max * 4 + 1 }, (_, i) => i / 4)

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <ChapterMark n={1} title={t("chapters.internet.title")} />
      <div className="reveal mt-14 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("capacityEyebrow")}
          </p>
          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            {t("capacityTitle")}
          </h2>
          <p className="mt-5 max-w-lg text-zinc-400">{t("capacityBody", { max })}</p>
        </div>
        <p className="flex items-baseline gap-4 font-mono lg:justify-self-end">
          <span className="biz-display text-[clamp(6rem,16vw,13rem)] leading-[0.8] font-semibold tracking-[-0.07em]">{max}</span>
          <span className="text-2xl text-zinc-400 sm:text-3xl">
            {t("unit")}<sup className="text-[var(--biz-accent)]">*</sup>
          </span>
        </p>
      </div>

      {/* Precision ruler: quarter-Gbps ticks, labelled every 1 Gbps. Decorative. */}
      <InView className="reveal mt-14">
        <div aria-hidden>
          <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">
            <span>{t("capacityScale")}</span>
            <span>{t("capacityRange", { max })}</span>
          </div>
          <div className="relative mt-4 h-14">
            <div className="absolute inset-x-0 top-0 h-px bg-[var(--biz-line-strong)]" />
            <div className="biz-ruler-fill absolute inset-x-0 top-[-1px] h-[3px] bg-gradient-to-r from-white/30 via-[var(--biz-accent)] to-white shadow-[0_0_18px_rgb(167_139_250/0.55)]" />
            {ticks.map((v) => {
              const major = Number.isInteger(v)
              return (
                <div key={v} className="absolute top-0" style={{ left: `${(v / max) * 100}%` }}>
                  <div className={major ? "h-4 w-px bg-white/45" : "h-2 w-px bg-white/20"} />
                  {major && (
                    <span className="absolute top-6 -translate-x-1/2 font-mono text-[0.65rem] tabular-nums text-zinc-400 max-sm:[&:not(:first-child)]:hidden">
                      {v}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p className="mt-2 font-mono text-[0.65rem] text-zinc-400">* {t("speedQual")}</p>
      </InView>

      {/* Spaces we connect. */}
      <div className="mt-24">
        <h3 className="reveal font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">{t("spacesTitle")}</h3>
        <ul className="reveal-stagger mt-6 grid border-t border-l border-[var(--biz-line)] sm:grid-cols-2 lg:grid-cols-4" aria-label={t("spacesLabel")}>
          {business.spaces.map((s) => {
            const Icon = SPACE_ICONS[s]
            return (
              <li key={s} className="flex items-center gap-4 border-r border-b border-[var(--biz-line)] px-5 py-6">
                <Icon className="size-5 shrink-0 text-[var(--biz-accent)]" strokeWidth={1.5} aria-hidden />
                <span className="text-sm text-zinc-200">{t(`spaces.${s}`)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
