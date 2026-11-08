import { useTranslations } from "next-intl"
import { Building2, Cable, DraftingCompass, Gauge, Router, Wifi } from "lucide-react"
import { business } from "@/lib/business"

const ICONS = {
  customInstall: DraftingCompass,
  everyArea: Building2,
  dedicated: Gauge,
  cabling: Cable,
  wifi: Wifi,
  equipment: Router,
} as const

/**
 * The owner-confirmed business services (lib/business.ts) as a numbered
 * index, set like a datasheet: index · title · description · glyph, one row
 * each, hairlines between, a violet line sweeping in on hover.
 */
export function BusinessServices() {
  const t = useTranslations("business")
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("servicesEyebrow")}
          </p>
          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{t("servicesTitle")}</h2>
        </div>
        <p className="max-w-md text-zinc-400 lg:justify-self-end">{t("servicesLead")}</p>
      </div>

      <ol className="reveal-stagger mt-16 border-b border-[var(--biz-line)]">
        {business.services.map((id, i) => {
          const Icon = ICONS[id]
          return (
            <li
              key={id}
              className="biz-row grid grid-cols-[3rem_1fr] gap-x-4 gap-y-2 border-t border-[var(--biz-line)] py-8 transition-colors hover:bg-white/[0.015] md:grid-cols-[5rem_minmax(0,1.1fr)_minmax(0,1fr)_3rem] md:items-start md:gap-x-8"
            >
              <span className="font-mono text-sm tabular-nums text-[var(--biz-accent)]" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-xl font-medium tracking-[-0.02em] text-white sm:text-2xl">{t(`services.${id}.title`)}</h3>
              <p className="col-start-2 text-zinc-400 md:col-start-auto">{t(`services.${id}.body`, { max: business.maxLinkGbps })}</p>
              <Icon className="hidden size-6 justify-self-end text-zinc-400 md:block" strokeWidth={1.25} aria-hidden />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
