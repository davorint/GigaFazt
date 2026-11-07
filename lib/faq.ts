import { company } from "./company"
import { addOns } from "./plans"
import { isPlaceholder, type Maybe } from "./placeholder"

/**
 * FAQ (SPEC §8). Question/answer copy lives in messages (`faq.items.<id>`);
 * business-specific values are `facts` pulled from lib/company.ts, so an
 * unfilled BUSINESS.md value shows as a POR DEFINIR chip, never an invented
 * answer (hard rule #1). Only fully-answered items go into FAQPage JSON-LD.
 */
export type FaqFactValue = Maybe<string> | Maybe<number> | Maybe<number | null>

export interface FaqFact {
  /** Label key under `faq.facts`. */
  label: "installFee" | "installDays" | "term" | "cancellation" | "staticIp" | "whatsapp" | "phone" | "hours" | "moving"
  value: FaqFactValue
  /** "mxn": money (0 = free) · "term": months (null = no minimum term). */
  format?: "mxn" | "term"
}

export interface FaqItem {
  id: "speed" | "symmetric" | "install" | "contract" | "router" | "staticIp" | "support" | "moving" | "business" | "tv" | "coverage"
  facts: FaqFact[]
}

const { terms, policies } = company

export const faqItems: FaqItem[] = [
  { id: "speed", facts: [] },
  {
    id: "install",
    facts: [
      { label: "installFee", value: terms.installFeeMxn, format: "mxn" },
      { label: "installDays", value: terms.installDays },
    ],
  },
  {
    id: "contract",
    facts: [
      { label: "term", value: terms.contractTerm, format: "term" },
      { label: "cancellation", value: policies.cancellation },
    ],
  },
  // Answered from plan data (modem per plan, on loan): see faqEntries.
  { id: "router", facts: [] },
  { id: "staticIp", facts: [{ label: "staticIp", value: policies.staticIp }] },
  {
    id: "support",
    facts: [
      { label: "whatsapp", value: company.whatsapp },
      { label: "phone", value: company.salesPhone },
      { label: "hours", value: policies.supportHours },
    ],
  },
  { id: "moving", facts: [{ label: "moving", value: policies.moving }] },
  { id: "symmetric", facts: [] },
  { id: "business", facts: [] },
  { id: "tv", facts: [] },
  { id: "coverage", facts: [] },
]

/** Every fact is a real BUSINESS.md value (safe to publish as structured data). */
export function isAnswered(item: FaqItem): boolean {
  return item.facts.every((f) => !isPlaceholder(f.value))
}

/** ICU args for the TV answer, from lib/plans.ts (price stays in Plans, next to its terms). */
export function tvFaqArgs() {
  const tv = addOns.find((a) => a.id === "tv")
  return {
    channels: tv?.contents?.channels ?? 0,
    movies: tv?.contents?.movies ?? 0,
    series: tv?.contents?.series ?? 0,
  }
}
