/**
 * Localized state names from messages (`states.{slug}`): `name` for labels,
 * `in` for running text after "en"/"in" ("la Ciudad de México", "the State of
 * Mexico"). `ts` is a translator scoped to the "states" namespace.
 */
type T = (key: string) => string

export const stateName = (ts: T, slug: string) => ts(`${slug}.name`)
export const stateIn = (ts: T, slug: string) => ts(`${slug}.in`)

/** The served part of a state for running text ("Cuernavaca, Tepoztlán y Amatlán"). */
export const stateServed = (ts: T, slug: string) => ts(`${slug}.served`)
