import { useTranslations } from "next-intl"
import { Building2, Cable, DraftingCompass, Network, Router, Wifi } from "lucide-react"
import { business } from "@/lib/business"
import { ChapterMark } from "./ChapterMark"
import { QuoteButton } from "./QuoteButton"
import { LazyFloorLab } from "./LazyFloorLab"

const SERVICE_ICONS = {
  customInstall: DraftingCompass,
  fiberLan: Network,
  everyArea: Building2,
  cabling: Cable,
  wifi: Wifi,
  equipment: Router,
} as const

/**
 * Chapter 02, fiber networks: a full-width statement (the 400GbE figure now
 * lives in the hero story, not repeated here), the interactive floor
 * (FloorLab, lazy) as the centerpiece, then what we do as a two-column
 * datasheet with the heading set beside it, so the chapter doesn't repeat the
 * page's "heading left, lead right" pattern.
 */
export function BusinessNetworks() {
  const t = useTranslations("business")
  const { from, to } = business.internalNetworkGbps

  return (
    <div className="relative overflow-hidden border-t border-[var(--biz-line)]">
      <div aria-hidden className="biz-blueprint pointer-events-none absolute inset-x-0 top-0 h-[60rem] [mask-image:radial-gradient(70%_60%_at_75%_25%,#000_20%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute top-0 right-[-15%] h-[50rem] w-[50rem] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.12),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-36">
        <ChapterMark n={2} title={t("chapters.fiber.title")} />

        {/* Opener: one statement, full width, the facts as a quiet line. */}
        <div className="reveal mt-12">
          <h2 className="biz-display max-w-5xl text-5xl leading-[0.98] font-[450] tracking-[-0.045em] text-balance sm:text-7xl lg:text-[6rem]">
            {t("fiber.title")}
          </h2>
          <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-2xl text-lg leading-relaxed text-zinc-400">
              {t("fiber.lead")} {t("fiber.figureNote", { from, to })}
            </p>
            <QuoteButton context="business_fiber" message={t("fiber.whatsappMessage")} preset={{ needs: ["fiberLan"] }} className="shrink-0" />
          </div>
        </div>

        {/* Centerpiece: the interactive floor. */}
        <div className="mt-24">
          <div className="reveal max-w-2xl">
            <h3 className="text-3xl font-medium tracking-[-0.025em] text-white sm:text-4xl">{t("floor.title")}</h3>
            <p className="mt-4 text-zinc-400">{t("floor.lead")}</p>
          </div>
          <div className="mt-10">
            <LazyFloorLab />
          </div>
        </div>

        {/* What we do: heading beside a two-column datasheet. */}
        <div className="mt-28 grid gap-10 lg:grid-cols-[1fr_2.2fr]">
          <div className="reveal lg:sticky lg:top-28 lg:self-start">
            <h3 className="text-3xl font-medium tracking-[-0.025em] text-white sm:text-4xl">{t("fiber.doTitle")}</h3>
            <p className="mt-4 max-w-xs text-zinc-400">{t("fiber.doLead")}</p>
          </div>
          <ol className="reveal-stagger grid gap-px overflow-hidden border border-[var(--biz-line)] bg-[var(--biz-line)] sm:grid-cols-2">
            {business.services.map((id, i) => {
              const Icon = SERVICE_ICONS[id]
              return (
                <li key={id} className="biz-row flex flex-col bg-[var(--biz-bg)] p-6 sm:p-7">
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-sm text-[var(--biz-accent)] tabular-nums" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon className="size-5 text-zinc-400" strokeWidth={1.25} aria-hidden />
                  </span>
                  <h4 className="mt-6 text-xl font-medium tracking-[-0.02em] text-white">{t(`services.${id}.title`)}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t(`services.${id}.body`, { max: business.maxLinkGbps, from, to })}</p>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
