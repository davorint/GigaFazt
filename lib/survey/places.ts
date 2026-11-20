/**
 * The states and municipalities offered on a survey (owner, 2026-11-20): Mexico City's 16 alcaldías, Huixquilucan and
 * Naucalpan in the State of Mexico, and the Morelos towns we serve. Anything else is typed in ("Otro"). Stored as the
 * names themselves, so a typed one and a listed one read the same everywhere.
 */
export const PLACES = {
  "Ciudad de México": [
    "Álvaro Obregón",
    "Azcapotzalco",
    "Benito Juárez",
    "Coyoacán",
    "Cuajimalpa de Morelos",
    "Cuauhtémoc",
    "Gustavo A. Madero",
    "Iztacalco",
    "Iztapalapa",
    "La Magdalena Contreras",
    "Miguel Hidalgo",
    "Milpa Alta",
    "Tláhuac",
    "Tlalpan",
    "Venustiano Carranza",
    "Xochimilco",
  ],
  "Estado de México": ["Huixquilucan", "Naucalpan de Juárez"],
  Morelos: ["Cuernavaca", "Tepoztlán"],
} as const

export type KnownState = keyof typeof PLACES
export const STATES = Object.keys(PLACES) as KnownState[]

export const isKnownState = (s: string): s is KnownState => (STATES as string[]).includes(s)

/** The listed municipalities of a state; of every listed state when none is chosen; none for a typed-in state. */
export function municipalitiesOf(state: string): readonly string[] {
  if (!state) return STATES.flatMap((s) => PLACES[s])
  return isKnownState(state) ? PLACES[state] : []
}

/** The listed state a listed municipality belongs to ("" when it isn't listed). */
export const stateOf = (municipality: string): KnownState | "" => STATES.find((s) => (PLACES[s] as readonly string[]).includes(municipality)) ?? ""
