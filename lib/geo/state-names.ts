import { STATES } from "./states"

/**
 * Localized state names from messages (`states.{slug}`): `name` for labels,
 * `in` for running text after "en"/"in" ("la Ciudad de México", "the State of
 * Mexico"). `ts` is a translator scoped to the "states" namespace.
 */
type T = (key: string) => string

export const stateName = (ts: T, slug: string) => ts(`${slug}.name`)
export const stateIn = (ts: T, slug: string) => ts(`${slug}.in`)

/** "la Ciudad de México, el Estado de México y Morelos" */
export function statesInList(ts: T, locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(STATES.map((s) => stateIn(ts, s.slug)))
}
