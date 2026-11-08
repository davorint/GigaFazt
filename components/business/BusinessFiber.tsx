import { useTranslations } from "next-intl"
import { business } from "@/lib/business"
import { InView } from "@/components/layout/InView"
import { ChapterMark } from "./ChapterMark"
import { IsoBuilding } from "./IsoBuilding"
import { QuoteButton } from "./QuoteButton"

/**
 * Chapter 02 opener: fiber network deployment and cabling, the page's
 * heaviest moment. Blueprint field with a violet bloom, display headline, the
 * isometric building schematic (fiber from the street up every level), then
 * the internal-network range (lib/business internalNetworkGbps, shown in GbE
 * so it never reads as the internet speed) as an oversized figure over a precision scale whose band fills once on view.
 */
export function BusinessFiber() {
  const t = useTranslations("business")
  const { from, to } = business.internalNetworkGbps
  const step = 50
  const ticks = Array.from({ length: to / step + 1 }, (_, i) => i * step)
  const stats = [
    { k: "lan", v: t("fiber.stats.lanValue", { from, to }) },
    { k: "reach", v: t("fiber.stats.reachValue") },
    { k: "project", v: t("fiber.stats.projectValue") },
  ] as const

  return (
    <div className="relative overflow-hidden border-t border-[var(--biz-line)]">
      <div aria-hidden className="biz-blueprint pointer-events-none absolute inset-0 [mask-image:radial-gradient(80%_70%_at_70%_35%,#000_30%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute top-[10%] right-[-15%] h-[52rem] w-[52rem] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.16),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 pt-24 pb-24 sm:px-6 sm:pt-32 sm:pb-32">
        <ChapterMark n={2} title={t("chapters.fiber.title")} />

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="reveal">
            <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
              <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
              {t("fiber.eyebrow")}
            </p>
            <h2 className="biz-display mt-6 text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
              {t("fiber.title")}
            </h2>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">{t("fiber.lead")}</p>
            <QuoteButton context="business_fiber" message={t("fiber.whatsappMessage")} className="mt-10" />
          </div>
          <InView className="relative mx-auto w-full max-w-[36rem]">
            <IsoBuilding className="h-auto w-full" />
          </InView>
        </div>

        {/* The internal-network range: oversized figure + precision scale. */}
        <InView className="reveal mt-20 sm:mt-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <p className="flex items-baseline gap-4 font-mono">
              <span className="biz-display text-[clamp(6rem,22vw,17rem)] leading-[0.78] font-semibold tracking-[-0.07em]">{to}</span>
              <span className="flex flex-col text-2xl text-zinc-400 sm:text-4xl">
                {t("unitLan")}
                <span className="mt-1 text-[0.65rem] uppercase tracking-[0.25em] sm:text-xs">{t("unitLanLong")}</span>
              </span>
            </p>
            <p className="max-w-xs pb-3 text-zinc-400">{t("fiber.figureNote", { from, to })}</p>
          </div>
          <div aria-hidden className="mt-10">
            <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">
              <span>{t("fiber.scale")}</span>
              <span className="normal-case">{t("fiber.range", { from, to })}</span>
            </div>
            <div className="relative mt-4 h-14">
              <div className="absolute inset-x-0 top-0 h-px bg-[var(--biz-line-strong)]" />
              <div
                className="biz-ruler-fill absolute top-[-2px] right-0 h-[5px] bg-gradient-to-r from-[var(--biz-accent)] via-[#c4b5fd] to-white shadow-[0_0_28px_rgb(167_139_250/0.8)]"
                style={{ left: `${(from / to) * 100}%` }}
              />
              {ticks.map((v) => {
                const major = v % 100 === 0
                return (
                  <div key={v} className="absolute top-0" style={{ left: `${(v / to) * 100}%` }}>
                    <div className={major ? "h-4 w-px bg-white/45" : "h-2 w-px bg-white/20"} />
                    {major && <span className="absolute top-6 -translate-x-1/2 font-mono text-[0.65rem] tabular-nums text-zinc-400">{v}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </InView>

        <dl className="reveal-stagger mt-16 grid border-y border-[var(--biz-line)] sm:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={s.k}
              className="flex flex-col-reverse gap-2 border-[var(--biz-line)] py-5 max-sm:border-b max-sm:last:border-b-0 sm:border-l sm:px-5 sm:first:border-l-0 sm:first:pl-0"
            >
              <dd className="text-lg font-medium tracking-[-0.01em] text-white">{s.v}</dd>
              <dt className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">
                <span className="text-[var(--biz-accent)]">{String(i + 1).padStart(2, "0")}</span> · {t(`fiber.stats.${s.k}`)}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
