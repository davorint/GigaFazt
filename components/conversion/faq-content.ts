import { faqItems, tvFaqArgs, type FaqFact, type FaqItem } from "@/lib/faq"
import { statesInList } from "@/lib/geo/state-names"
import { formatMxn } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"

type T = (key: string, args?: Record<string, string | number>) => string

export interface FaqEntry {
  item: FaqItem
  question: string
  answer: string
}

/** Resolved question/answer copy for each FAQ item (shared by UI and JSON-LD). */
export function faqEntries(t: T, locale: string): FaqEntry[] {
  const tv = tvFaqArgs()
  const states = statesInList((k) => t(`states.${k}`), locale)
  const args: Partial<Record<FaqItem["id"], Record<string, string | number>>> = {
    tv: { channels: tv.channels, movies: tv.movies, series: tv.series },
    coverage: { states },
    moving: { states },
  }
  return faqItems.map((item) => ({
    item,
    question: t(`faq.items.${item.id}.q`),
    answer: t(`faq.items.${item.id}.a`, args[item.id]),
  }))
}

/** Display string for a resolved fact (callers handle placeholders first). */
export function factText(fact: FaqFact, locale: string): string | null {
  if (isPlaceholder(fact.value)) return null
  return fact.format === "mxn" && typeof fact.value === "number"
    ? `$${formatMxn(fact.value, locale)} MXN`
    : String(fact.value)
}
