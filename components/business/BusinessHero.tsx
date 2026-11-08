import { useTranslations } from "next-intl"
import { business } from "@/lib/business"
import { QuoteButton } from "./QuoteButton"
import { IsoBuilding } from "./IsoBuilding"
import { BuildingShowcase } from "./BuildingShowcase"

/**
 * /empresas hero (owner, 2026-11-08: "super expensive, hyper high profile"):
 * a statement headline instead of a category label, one primary action and a
 * quiet secondary, and the building as the page's centerpiece (live 3D over
 * the schematic). The two lines of business are small jump links, the spaces
 * we connect one quiet line. Each figure (10 Gbps, 400GbE) is shown once, in
 * the lead here and again only in its own chapter.
 */
export function BusinessHero() {
  const t = useTranslations("business")
  const { to } = business.internalNetworkGbps

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="biz-blueprint biz-fade-x pointer-events-none absolute inset-0 [mask-image:radial-gradient(90%_80%_at_60%_40%,#000_35%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute top-[18%] right-[-8%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.14),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pt-28 pb-16 sm:px-6 lg:min-h-[100svh] lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:pt-24 lg:pb-12">
        <div className="relative z-10">
          <h1 className="biz-display text-[2.6rem] leading-[1] font-[450] tracking-[-0.045em] text-balance sm:text-6xl lg:text-[5.5rem]">
            {t("h1")}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">
            {t("lead", { max: business.maxLinkGbps, to })}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <QuoteButton context="business_hero" />
            <a
              href="#business-internet"
              className="inline-flex min-h-12 items-center rounded-[4px] border border-[var(--biz-line-strong)] px-6 text-[0.95rem] font-medium text-white transition-colors hover:border-white/40 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--biz-accent)] focus-visible:outline-none"
            >
              {t("seePackages")}
            </a>
          </div>
          <p className="mt-4 text-sm text-zinc-400">{t("quoteNote")}</p>

          {/* The two lines of business, as quiet jump links. */}
          <nav aria-label={t("chapters.label")} className="mt-14 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--biz-line)] pt-6 text-sm">
            {(["internet", "fiber"] as const).map((id, i) => (
              <a
                key={id}
                href={id === "internet" ? "#business-internet" : "#business-networks"}
                className="group inline-flex items-baseline gap-2.5 rounded text-zinc-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--biz-accent)] focus-visible:outline-none"
              >
                <span className="font-mono text-xs text-[var(--biz-accent)] tabular-nums" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {t(`chapters.${id}.title`)}
                <span aria-hidden className="transition-transform group-hover:translate-y-0.5">↓</span>
              </a>
            ))}
          </nav>
          <ul className="mt-5 flex flex-wrap gap-x-2 text-sm text-zinc-400" aria-label={t("spacesLabel")}>
            {business.spaces.map((s, i) => (
              <li key={s}>
                {i > 0 && <span aria-hidden className="mr-2 text-zinc-600">·</span>}
                {t(`spaces.${s}`)}
              </li>
            ))}
          </ul>
        </div>

        <BuildingShowcase
          alt={t("buildingAlt")}
          caption={t("buildingCaption")}
          className="h-[22rem] w-full sm:h-[30rem] lg:-mr-16 lg:h-[44rem] lg:w-[calc(100%+4rem)]"
          poster={<IsoBuilding uid="iso-hero" className="h-full w-full max-w-[40rem]" />}
        />
      </div>
    </div>
  )
}
