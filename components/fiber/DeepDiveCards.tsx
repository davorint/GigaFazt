import { useLocale, useTranslations } from "next-intl"
import { Cable, Network, Router, Waves } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { modemArgs } from "@/components/conversion/faq-content"

/**
 * Deep-dive cards (SPEC §4): fiber type · wavelengths · redundancy · router.
 * Values come from BUSINESS.md via lib/company.ts; unfilled ones render as a
 * visible POR DEFINIR chip (hard rule #1). Body copy is generic explanation.
 */
export function DeepDiveCards() {
  const t = useTranslations("fiber.deep")
  const locale = useLocale()
  const n = company.network

  const cards: { key: "fiberType" | "wavelengths" | "redundancy" | "router"; icon: typeof Cable; value: Maybe<string> }[] = [
    { key: "fiberType", icon: Cable, value: n.fiberTypes },
    { key: "wavelengths", icon: Waves, value: n.wavelengths },
    { key: "redundancy", icon: Network, value: n.backbone },
    { key: "router", icon: Router, value: t("router.value", modemArgs(locale)) },
  ]

  return (
    <div>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {cards.map(({ key, icon: Icon, value }) => (
          <li key={key} className="flex flex-col rounded-xl surface p-5">
            <Icon className="size-5 text-fiber" aria-hidden />
            <p className="mt-3 font-medium">{t(`${key}.title`)}</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`${key}.body`)}</p>
            <div className="mt-4 font-mono text-sm">
              {isPlaceholder(value) ? <PlaceholderChip keyName={value.key} /> : <span className="text-foreground">{value}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
