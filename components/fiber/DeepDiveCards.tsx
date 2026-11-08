import { useLocale, useTranslations } from "next-intl"
import { Cable, Network, Router, Waves } from "lucide-react"
import { company } from "@/lib/company"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { modemArgs } from "@/components/conversion/faq-content"

/**
 * Deep-dive cards (SPEC §4): fiber type · wavelengths · redundancy · router.
 * Values come from BUSINESS.md via lib/company.ts. A card shows only once its
 * value is filled (a grid of POR DEFINIR chips read as unfinished; the open
 * values stay listed in PROGRESS.md), and the block needs at least two cards
 * (`deepDiveReady`), so today it is hidden. Body copy is generic explanation.
 */

const MIN_CARDS = 2

/** Whether enough deep-dive values are filled to show the block. */
export function deepDiveReady() {
  const n = company.network
  // The router card is always filled (it comes from plan data).
  return 1 + [n.fiberTypes, n.wavelengths, n.backbone].filter((v) => !isPlaceholder(v)).length >= MIN_CARDS
}
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
  const filled = cards.filter((c) => !isPlaceholder(c.value))
  if (filled.length < MIN_CARDS) return null

  return (
    <div>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {filled.map(({ key, icon: Icon, value }) => (
          <li key={key} className="flex flex-col rounded-xl surface p-5">
            <Icon className="size-5 text-fiber" aria-hidden />
            <p className="mt-3 font-medium">{t(`${key}.title`)}</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`${key}.body`)}</p>
            <div className="mt-4 font-mono text-sm">
              <span className="text-foreground">{value as string}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
