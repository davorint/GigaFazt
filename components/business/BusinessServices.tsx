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

/** The owner-confirmed business services (lib/business.ts), one card each. */
export function BusinessServices() {
  const t = useTranslations("business")
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("servicesEyebrow")} ]</p>
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{t("servicesTitle")}</h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("servicesLead")}</p>

      <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {business.services.map((id) => {
          const Icon = ICONS[id]
          return (
            <li key={id} className="flex flex-col gap-3 bg-surface p-6">
              <span className="flex size-10 items-center justify-center rounded-lg border border-fiber/30 bg-fiber/10">
                <Icon className="size-5 text-fiber" aria-hidden />
              </span>
              <h3 className="font-semibold">{t(`services.${id}.title`)}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`services.${id}.body`, { max: business.maxLinkGbps })}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
