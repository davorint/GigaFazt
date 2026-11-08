import { useLocale, useTranslations } from "next-intl"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { ArrowRight } from "lucide-react"
import { LazyCoverageMap } from "./LazyCoverageMap"
import { ClientList } from "./ClientList"
import { MapLegend } from "./MapLegend"

/** Coverage Map section (SPEC §5, owner direction: state-level, clients first). */
export function CoverageMapSection() {
  const t = useTranslations()
  const locale = useLocale()
  return (
    <div className="py-24">
      <div className="reveal mx-auto max-w-7xl px-4 sm:px-6">
      <p className="eyebrow mb-3">[ {t("sections.map")} ]</p>
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        {t("sectionHeads.map")}
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("map.lead", { count: isPlaceholder(company.network.clients) ? "—" : company.network.clients.toLocaleString(locale) })}</p>

      </div>

      {/* Full-bleed: the tilted map is the section's centerpiece, edge to edge. */}
      <div className="mt-8">
        <LazyCoverageMap />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <MapLegend className="mt-3 md:hidden" />

      <div className="reveal mt-10">
        <ClientList />
      </div>

      <div className="mt-10 flex justify-center">
        <a
          href="#plans"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("map.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
      </div>
    </div>
  )
}
