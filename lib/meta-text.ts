import { sharedPlanPerks } from "./plans"
import { HREFLANG } from "./site"

/**
 * ", instalación gratis y sin plazo forzoso" for meta descriptions: the terms
 * every plan shares (lib/plans), never a claim the data doesn't back.
 * `t` is the "meta" namespace.
 */
export function perksSuffix(locale: string, t: (key: string) => string): string {
  const items = sharedPlanPerks().map((k) => t(`perks.${k}`))
  return items.length ? `, ${new Intl.ListFormat(HREFLANG[locale] ?? locale, { type: "conjunction" }).format(items)}` : ""
}
