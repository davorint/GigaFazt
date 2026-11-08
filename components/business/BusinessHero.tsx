import { useTranslations } from "next-intl"
import { ArrowDown } from "lucide-react"
import { business } from "@/lib/business"
import { InView } from "@/components/layout/InView"
import { IsoBuilding } from "./IsoBuilding"
import { QuoteButton } from "./QuoteButton"

/**
 * /empresas hero, in the page's own "enterprise" language (globals.css
 * `.biz*`): blueprint grid, white display type, the isometric building
 * schematic, and a spec bar of owner-confirmed facts along the bottom.
 */
export function BusinessHero() {
  const t = useTranslations("business")
  const spec = [
    { k: "link", v: t("spec.linkValue", { max: business.maxLinkGbps }), note: true },
    { k: "reach", v: t("spec.reachValue") },
    { k: "project", v: t("spec.projectValue") },
    { k: "quote", v: t("spec.quoteValue") },
  ] as const

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="biz-blueprint biz-fade-x pointer-events-none absolute inset-0 [mask-image:radial-gradient(90%_80%_at_60%_40%,#000_35%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 right-[-10%] h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.10),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-32 pb-12 sm:px-6 lg:min-h-[calc(100svh-7rem)] lg:grid-cols-[1.05fr_1fr] lg:pt-28">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("eyebrow")}
          </p>
          <h1 className="biz-display mt-6 text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[5.25rem]">
            {t("h1")}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">{t("lead")}</p>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <QuoteButton context="business_hero" />
            <a
              href="#business-services"
              className="inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("jump")}
              <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>
          <p className="mt-4 text-sm text-zinc-400">{t("quoteNote")}</p>
        </div>

        <InView className="relative mx-auto w-full max-w-[36rem]">
          <IsoBuilding className="h-auto w-full" />
        </InView>
      </div>

      {/* Spec bar: four owner-confirmed facts, set like a datasheet header. */}
      <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <dl className="grid border-y border-[var(--biz-line)] sm:grid-cols-2 lg:grid-cols-4">
          {spec.map((s, i) => (
            <div
              key={s.k}
              className="flex flex-col-reverse gap-2 border-[var(--biz-line)] py-5 max-lg:border-b max-lg:last:border-b-0 sm:px-5 sm:first:pl-0 lg:border-l lg:first:border-l-0"
            >
              <dd className="text-lg font-medium tracking-[-0.01em] text-white">
                {s.v}
                {"note" in s && <sup className="ml-0.5 text-[var(--biz-accent)]">*</sup>}
              </dd>
              <dt className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">
                <span className="text-[var(--biz-accent)]">{String(i + 1).padStart(2, "0")}</span> · {t(`spec.${s.k}`)}
              </dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 font-mono text-[0.65rem] text-zinc-400">* {t("speedQual")}</p>
      </div>
    </div>
  )
}
