import { faqItems, tvFaqArgs, type FaqFact, type FaqItem } from "@/lib/faq"
import { formatMxn } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { plansWith } from "@/lib/plans"
import { hourLabel, speedLabel } from "@/lib/format"

type T = (key: string, args?: Record<string, string | number>) => string

export interface FaqEntry {
  item: FaqItem
  question: string
  answer: string
}

/** Resolved question/answer copy for each FAQ item (shared by UI and JSON-LD). */
export function faqEntries(t: T, locale: string): FaqEntry[] {
  const tv = tvFaqArgs()
  const area = t("coverage.area")
  const args: Partial<Record<FaqItem["id"], Record<string, string | number>>> = {
    tv: { channels: tv.channels, movies: tv.movies, series: tv.series },
    coverage: { area },
    moving: { area },
    router: modemArgs(locale),
  }
  return faqItems.map((item) => ({
    item,
    question: t(`faq.items.${item.id}.q`),
    answer: t(`faq.items.${item.id}.a`, args[item.id]),
  }))
}

/** Display string for a resolved fact (callers handle placeholders first). */
export function factText(fact: FaqFact, locale: string, t: T): string | null {
  if (isPlaceholder(fact.value)) return null
  if (fact.format === "mxn" && typeof fact.value === "number") {
    return fact.value === 0 ? t("plans.free") : `$${formatMxn(fact.value, locale)} MXN`
  }
  if (fact.format === "hours" && typeof fact.value === "object" && fact.value !== null) {
    return t("faq.officeHoursValue", { open: hourLabel(fact.value.open, locale), close: hourLabel(fact.value.close, locale) })
  }
  if (fact.format === "term") {
    return fact.value === null ? t("plans.noContract") : t("plans.months", { count: Number(fact.value) })
  }
  return String(fact.value)
}

/** Speeds that include each modem, as localized lists ("200 Mbps y 500 Mbps"). */
export function modemArgs(locale: string): { wifi7: string; wifi6: string } {
  const list = (id: "wifi7Modem" | "wifi6Modem") =>
    new Intl.ListFormat(locale, { type: "conjunction" }).format(plansWith(id).map((p) => speedLabel(p.downMbps)))
  return { wifi7: list("wifi7Modem"), wifi6: list("wifi6Modem") }
}
