import { useTranslations } from "next-intl"
import { Briefcase, Building, Store, Warehouse } from "lucide-react"
import { business } from "@/lib/business"
import { BuildingDiagram } from "./BuildingDiagram"
import { QuoteButton } from "./QuoteButton"
import { InView } from "@/components/layout/InView"

const SPACE_ICONS = { offices: Briefcase, warehouses: Warehouse, retail: Store, buildings: Building } as const

/** /empresas hero: the promise ("gigabit en todas las áreas") + quote CTA + diagram. */
export function BusinessHero() {
  const t = useTranslations("business")
  return (
    <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-28 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-36">
      <div>
        <p className="eyebrow mb-4">[ {t("eyebrow")} ]</p>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl">{t("h1")}</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t("lead")}</p>

        <p className="mt-6 font-mono text-sm">
          <span className="text-fiber">{t("speed", { max: business.maxLinkGbps })}</span>
          <span className="text-muted-foreground"> · {t("speedQual")}</span>
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <QuoteButton context="business_hero" />
          <span className="text-sm text-muted-foreground">{t("quoteNote")}</span>
        </div>

        <ul className="mt-10 flex flex-wrap gap-2" aria-label={t("spacesLabel")}>
          {business.spaces.map((s) => {
            const Icon = SPACE_ICONS[s]
            return (
              <li key={s} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 text-fiber" aria-hidden />
                {t(`spaces.${s}`)}
              </li>
            )
          })}
        </ul>
      </div>

      <InView className="surface hud-brackets relative rounded-xl p-4 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(ellipse_at_50%_60%,rgb(34_211_238/0.14),transparent_70%)]" />
        <BuildingDiagram className="relative h-auto w-full" />
        <p className="relative mt-3 text-center font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {t("diagramCaption")}
        </p>
      </InView>
    </div>
  )
}
