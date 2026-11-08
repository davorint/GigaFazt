import { useTranslations } from "next-intl"
import { Building2, Cable, DraftingCompass, Network, Router, Wifi } from "lucide-react"
import { business } from "@/lib/business"
import { ChapterMark } from "./ChapterMark"
import { QuoteButton } from "./QuoteButton"
import { NetworkUses } from "./NetworkUses"

const SERVICE_ICONS = {
  customInstall: DraftingCompass,
  fiberLan: Network,
  everyArea: Building2,
  cabling: Cable,
  wifi: Wifi,
  equipment: Router,
} as const

/**
 * Chapter 02, one story (it used to be three sections repeating the same
 * idea): the opener with the internal-network figure (the page's only large
 * "400GbE"), what we do (the owner-confirmed services as a datasheet index),
 * then what the network makes possible (NetworkUses).
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

        <div className="mt-12 grid gap-14 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div className="reveal">
            <h2 className="biz-display text-4xl leading-[1.02] font-[450] tracking-[-0.04em] text-balance sm:text-6xl">{t("fiber.title")}</h2>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">{t("fiber.lead")}</p>
            <QuoteButton context="business_fiber" message={t("fiber.whatsappMessage")} className="mt-10" />
          </div>
          <div className="reveal lg:justify-self-end">
            <p className="flex items-baseline gap-4">
              <span className="biz-display font-mono text-[clamp(6rem,20vw,15rem)] leading-[0.8] font-semibold tracking-[-0.07em]">{to}</span>
              <span className="flex flex-col font-mono text-2xl text-zinc-400 sm:text-3xl">
                {t("unitLan")}
                <span className="mt-1 font-sans text-xs text-zinc-400">{t("unitLanLong")}</span>
              </span>
            </p>
            <p className="mt-6 max-w-sm text-zinc-400">{t("fiber.figureNote", { from, to })}</p>
          </div>
        </div>

        {/* What we do. */}
        <h3 className="reveal mt-28 text-2xl font-medium tracking-[-0.02em] text-white sm:text-3xl">{t("fiber.doTitle")}</h3>
        <ol className="reveal-stagger mt-8 border-b border-[var(--biz-line)]">
          {business.services.map((id, i) => {
            const Icon = SERVICE_ICONS[id]
            return (
              <li
                key={id}
                className="biz-row grid grid-cols-[3rem_1fr] gap-x-4 gap-y-2 border-t border-[var(--biz-line)] py-7 transition-colors hover:bg-white/[0.015] md:grid-cols-[5rem_minmax(0,1.1fr)_minmax(0,1fr)_3rem] md:items-start md:gap-x-8"
              >
                <span className="font-mono text-sm text-[var(--biz-accent)] tabular-nums" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h4 className="text-xl font-medium tracking-[-0.02em] text-white sm:text-2xl">{t(`services.${id}.title`)}</h4>
                <p className="col-start-2 text-zinc-400 md:col-start-auto">{t(`services.${id}.body`, { max: business.maxLinkGbps, from, to })}</p>
                <Icon className="hidden size-6 justify-self-end text-zinc-400 md:block" strokeWidth={1.25} aria-hidden />
              </li>
            )
          })}
        </ol>

        <div className="mt-28">
          <NetworkUses />
        </div>
      </div>
    </div>
  )
}
