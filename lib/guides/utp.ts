/**
 * UTP cable color order (owner, 2026-11-21: "a guide about the order of the colors… for fast consulting"), from the
 * TIA-568 wiring standards T568A and T568B. Pin 1 is on the left looking at the plug's contacts with the clip facing away.
 */
export const COLORS = ["naranja", "verde", "azul", "cafe"] as const
export type WireColor = (typeof COLORS)[number]
/** A wire: its color, solid or white with a stripe of that color. */
export type Wire = { color: WireColor; white: boolean }

const w = (color: WireColor, white = false): Wire => ({ color, white })

/** Pins 1 to 8. */
export const T568B: Wire[] = [w("naranja", true), w("naranja"), w("verde", true), w("azul"), w("azul", true), w("verde"), w("cafe", true), w("cafe")]
export const T568A: Wire[] = [w("verde", true), w("verde"), w("naranja", true), w("azul"), w("azul", true), w("naranja"), w("cafe", true), w("cafe")]

export const STANDARDS = { T568B, T568A } as const
export type StandardId = keyof typeof STANDARDS

/** On-screen color of each pair. */
export const HEX: Record<WireColor, string> = { naranja: "#f97316", verde: "#22c55e", azul: "#3b82f6", cafe: "#92400e" }

