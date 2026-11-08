/**
 * Wi-Fi generations and the apartment model behind "Así viaja el Wi-Fi por tu
 * depa" (components/fiber/WifiLab). Two kinds of data, both kept out of
 * components:
 *
 *  - GENERATIONS: a like-for-like comparison (owner, 2026-11-08: "sell the
 *    modem"). Each generation is shown as a home modem with the SAME layout as
 *    the plan's modem: 2.4 + 5 GHz, 2 × 2 on each band, the widest channel the
 *    generation allows on those bands. `bandMaxMbps` are the standards' PHY
 *    rates for that layout (802.11n/ac/ax/be MCS tables, short guard
 *    interval), so the figures are computed, never invented, and the plan's
 *    modem is compared against its true peers instead of a 16-antenna,
 *    tri-band lab maximum. On Wi-Fi 5 modems the 2.4 GHz radio runs Wi-Fi 4
 *    (802.11ac is 5 GHz only). The UI note states the layout and that tri-band
 *    (6 GHz) equipment adds capacity.
 *  - The apartment, wall losses and the link model: an ILLUSTRATIVE simulation
 *    (hard rule #2: every surface that shows it carries SIMULACIÓN). Wall
 *    losses are approximate industry reference values and vary with the build.
 */

import { company } from "./company"

export type BandId = "b24" | "b5" | "b6"
export const BAND_IDS: readonly BandId[] = ["b24", "b5", "b6"]

export const BANDS: Record<BandId, { ghz: number; label: string; color: string }> = {
  b24: { ghz: 2.4, label: "2.4 GHz", color: "#a78bfa" },
  b5: { ghz: 5, label: "5 GHz", color: "#22d3ee" },
  b6: { ghz: 6, label: "6 GHz", color: "#e0f2fe" },
}

export type TechId = "mimo" | "muMimo" | "ofdma" | "twt" | "band6" | "mlo" | "ch320" | "qam4096"

/** Industry names of each technology (same in every language). */
export const TECH_SHORT: Record<TechId, string> = {
  mimo: "MIMO",
  muMimo: "MU-MIMO",
  ofdma: "OFDMA",
  twt: "TWT",
  band6: "6 GHz",
  mlo: "MLO",
  ch320: "320 MHz",
  qam4096: "4096-QAM",
}

export type Generation = {
  id: "wifi4" | "wifi5" | "wifi6" | "wifi7" | "modem"
  /** A home modem of that generation, or the plan's actual modem (named in messages, never by brand). */
  kind: "standard" | "modem"
  /** Short name on the switcher ("4", "6"…) and the full brand name. */
  short: string
  name: string
  ieee: string
  /** IEEE ratification (4, 5) or Wi-Fi Alliance certification launch (6, 7); none for the modem. */
  year: number | null
  bands: readonly BandId[]
  maxChannelMhz: number
  qam: number
  streams: number
  /** Theoretical maximum PHY rate, both bands combined, Gbps. */
  maxGbps: number
  /** Theoretical max per band, Mbps. */
  bandMaxMbps: Partial<Record<BandId, number>>
  /** One device can use several bands at the same time (Multi-Link Operation). */
  mlo: boolean
  /** Splits each channel among many devices (OFDMA). */
  ofdma: boolean
  tech: readonly TechId[]
}

const DUAL: readonly BandId[] = ["b24", "b5"]
const sumGbps = (b: Partial<Record<BandId, number>>) => Object.values(b).reduce((s, v) => s + (v ?? 0), 0) / 1000
const home = (g: Omit<Generation, "kind" | "bands" | "streams" | "maxGbps">): Generation => ({
  ...g,
  kind: "standard",
  bands: DUAL,
  streams: 4,
  maxGbps: sumGbps(g.bandMaxMbps),
})

/** Dual-band 2 × 2 home modems, one per generation (PHY rates per band). */
export const GENERATIONS: readonly Generation[] = [
  home({ id: "wifi4", short: "4", name: "Wi-Fi 4", ieee: "802.11n", year: 2009, maxChannelMhz: 40, qam: 64, bandMaxMbps: { b24: 300, b5: 300 }, mlo: false, ofdma: false, tech: ["mimo"] }),
  home({ id: "wifi5", short: "5", name: "Wi-Fi 5", ieee: "802.11ac", year: 2013, maxChannelMhz: 160, qam: 256, bandMaxMbps: { b24: 300, b5: 1733 }, mlo: false, ofdma: false, tech: ["muMimo"] }),
  home({ id: "wifi6", short: "6", name: "Wi-Fi 6", ieee: "802.11ax", year: 2019, maxChannelMhz: 160, qam: 1024, bandMaxMbps: { b24: 574, b5: 2402 }, mlo: false, ofdma: true, tech: ["ofdma", "twt"] }),
  home({ id: "wifi7", short: "7", name: "Wi-Fi 7", ieee: "802.11be", year: 2024, maxChannelMhz: 160, qam: 4096, bandMaxMbps: { b24: 688, b5: 2882 }, mlo: true, ofdma: true, tech: ["mlo", "qam4096", "ofdma"] }),
]

export const MAX_CHANNEL_MHZ = Math.max(...GENERATIONS.map((g) => g.maxChannelMhz))

/** The 1 Gbps plan's Wi-Fi 7 modem as a profile the lab and table can show (lib/company.ts). */
const m = company.equipment.wifi7Modem
export const PLAN_MODEM: Generation = {
  id: "modem",
  kind: "modem",
  short: "7",
  name: "Wi-Fi 7",
  ieee: "802.11be",
  year: null,
  bands: m.bands,
  maxChannelMhz: m.maxChannelMhz,
  qam: m.qam,
  streams: m.streamsPerBand * m.bands.length,
  maxGbps: sumGbps(m.bandMaxMbps),
  bandMaxMbps: m.bandMaxMbps,
  mlo: m.mlo,
  ofdma: true,
  tech: [...(m.mlo ? (["mlo"] as const) : []), ...(m.qam >= 4096 ? (["qam4096"] as const) : []), "ofdma"],
}

/** What the page compares: the plan's modem takes the Wi-Fi 7 slot when a plan includes it. */
export function lineup(hasPlanModem: boolean): readonly Generation[] {
  return hasPlanModem ? [...GENERATIONS.filter((g) => g.id !== "wifi7"), PLAN_MODEM] : GENERATIONS
}

export function getGeneration(id: Generation["id"]): Generation {
  if (id === "modem") return PLAN_MODEM
  return GENERATIONS.find((g) => g.id === id) ?? GENERATIONS[GENERATIONS.length - 1]
}

/** Shortest burst share the wave lab draws, so even the slowest band stays visible. */
export const MIN_BURST_FILL = 0.1

/**
 * How densely each band's waves carry data in the lab, 0–1: the band's PHY
 * rate in this generation over the fastest rate any compared generation
 * reaches on that band. Every compared modem is dual band and walls slow all
 * generations alike, so range is the same; what changes between generations
 * is how much data each wave carries, drawn as denser wave trains. Bands the
 * generation doesn't use are 0.
 */
export function burstFill(gen: Generation, compared: readonly Generation[]): Record<BandId, number> {
  const fill = { b24: 0, b5: 0, b6: 0 } as Record<BandId, number>
  for (const b of gen.bands) {
    const top = Math.max(...compared.map((g) => g.bandMaxMbps[b] ?? 0))
    const mine = gen.bandMaxMbps[b] ?? 0
    fill[b] = top > 0 ? Math.min(1, Math.max(MIN_BURST_FILL, mine / top)) : 1
  }
  return fill
}

// ── The apartment (meters; x → right, y → down) ────────────────────────────

export type MaterialId = "concrete" | "brick" | "drywall"
export const MATERIAL_IDS: readonly MaterialId[] = ["concrete", "brick", "drywall"]

/** Approximate loss of one wall, dB (reference values; real walls vary). */
export const WALL_LOSS_DB: Record<MaterialId, Record<BandId, number>> = {
  concrete: { b24: 12, b5: 20, b6: 23 },
  brick: { b24: 8, b5: 12, b6: 14 },
  drywall: { b24: 3, b5: 4, b6: 5 },
}
export const WALL_THICKNESS_M: Record<MaterialId, number> = { concrete: 0.2, brick: 0.15, drywall: 0.1 }

export type Pt = { x: number; y: number }
export type Wall = { a: Pt; b: Pt; m: MaterialId }

export const APT = { w: 12, h: 7.5 } as const

const w = (ax: number, ay: number, bx: number, by: number, m: MaterialId): Wall => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, m })

/** Concrete shell, brick between rooms, drywall between study and bedroom 2; gaps are doors. */
export const WALLS: readonly Wall[] = [
  w(0, 0, 12, 0, "concrete"),
  w(12, 0, 12, 7.5, "concrete"),
  w(12, 7.5, 0, 7.5, "concrete"),
  w(0, 7.5, 0, 0, "concrete"),
  // y = 4.5 (front rooms | back rooms), doors to the study, bedroom 2 and bath
  w(0, 4.5, 2.3, 4.5, "brick"),
  w(3.1, 4.5, 4.2, 4.5, "brick"),
  w(5.0, 4.5, 9.0, 4.5, "brick"),
  w(9.8, 4.5, 12, 4.5, "brick"),
  // living | kitchen: open kitchen
  w(6.5, 0, 6.5, 1.2, "brick"),
  w(6.5, 3.6, 6.5, 4.5, "brick"),
  // kitchen | master bedroom, door near the back
  w(8.5, 0, 8.5, 3.3, "brick"),
  w(8.5, 4.1, 8.5, 4.5, "brick"),
  // study | bedroom 2, bedroom 2 | bath
  w(3.5, 4.5, 3.5, 7.5, "drywall"),
  w(8, 4.5, 8, 7.5, "brick"),
]

export type RoomId = "living" | "kitchen" | "master" | "study" | "bedroom2" | "bath"
export const ROOMS: readonly { id: RoomId; x: number; y: number; w: number; h: number }[] = [
  { id: "living", x: 0, y: 0, w: 6.5, h: 4.5 },
  { id: "kitchen", x: 6.5, y: 0, w: 2, h: 4.5 },
  { id: "master", x: 8.5, y: 0, w: 3.5, h: 4.5 },
  { id: "study", x: 0, y: 4.5, w: 3.5, h: 3 },
  { id: "bedroom2", x: 3.5, y: 4.5, w: 4.5, h: 3 },
  { id: "bath", x: 8, y: 4.5, w: 4, h: 3 },
]

export type DeviceId = "tv" | "laptop" | "console" | "phone" | "speaker"
export const DEVICES: readonly { id: DeviceId; at: Pt }[] = [
  { id: "tv", at: { x: 0.9, y: 2.6 } },
  { id: "laptop", at: { x: 1.7, y: 6.4 } },
  { id: "console", at: { x: 6.0, y: 6.7 } },
  { id: "phone", at: { x: 10.8, y: 1.6 } },
  { id: "speaker", at: { x: 10.6, y: 6.4 } },
]

/** Starting spot: in the living room, near the open kitchen. */
export const ROUTER_START: Pt = { x: 5.2, y: 1.4 }
const EDGE = 0.25
export function clampRouter(p: Pt): Pt {
  return {
    x: Math.min(APT.w - EDGE, Math.max(EDGE, p.x)),
    y: Math.min(APT.h - EDGE, Math.max(EDGE, p.y)),
  }
}

export function roomAt(p: Pt): RoomId {
  return (ROOMS.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) ?? ROOMS[0]).id
}

// ── Link model (illustrative) ──────────────────────────────────────────────

const TX_DBM = 20
/** Indoor log-distance exponent (free space is 2; homes are typically ~3). */
const PATH_EXP = 3

/** Path loss, dB: free space at 1 m, then the indoor exponent (distance floored at 0.5 m). */
export function pathLossDb(distM: number, ghz: number): number {
  const at1m = 20 * Math.log10(ghz * 1000) - 27.55
  return at1m + 10 * PATH_EXP * Math.log10(Math.max(distM, 0.5))
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Walls the straight line from `p` to `q` passes through. */
export function wallsCrossed(p: Pt, q: Pt, walls: readonly Wall[] = WALLS): Wall[] {
  return walls.filter(({ a, b }) => {
    const d1 = cross(a, b, p)
    const d2 = cross(a, b, q)
    const d3 = cross(p, q, a)
    const d4 = cross(p, q, b)
    return d1 * d2 < 0 && d3 * d4 < 0
  })
}

export function signalDbm(router: Pt, device: Pt, band: BandId): number {
  const d = Math.hypot(device.x - router.x, device.y - router.y)
  const walls = wallsCrossed(router, device).reduce((s, wl) => s + WALL_LOSS_DB[wl.m][band], 0)
  return TX_DBM - pathLossDb(d, BANDS[band].ghz) - walls
}

export type Quality = "excellent" | "good" | "fair" | "weak"
export function quality(dbm: number): Quality {
  if (dbm >= -60) return "excellent"
  if (dbm >= -67) return "good"
  if (dbm >= -75) return "fair"
  return "weak"
}

export type Link = { bands: BandId[]; dbm: Partial<Record<BandId, number>>; quality: Quality }

/**
 * Which band(s) a device would use. Without MLO a device sits on one band: the
 * highest one that still has a good signal (wider, faster channels), otherwise
 * the strongest. With MLO (Wi-Fi 7) it uses every band that isn't weak at once.
 */
export function linkFor(gen: Generation, router: Pt, device: Pt): Link {
  const dbm: Partial<Record<BandId, number>> = {}
  for (const b of gen.bands) dbm[b] = signalDbm(router, device, b)
  const strongest = [...gen.bands].sort((a, b) => dbm[b]! - dbm[a]!)[0]
  const best = quality(dbm[strongest]!)

  if (gen.mlo) {
    const usable = gen.bands.filter((b) => quality(dbm[b]!) !== "weak")
    return { bands: usable.length ? [...usable] : [strongest], dbm, quality: best }
  }
  const fast = [...gen.bands].reverse().find((b) => {
    const q = quality(dbm[b]!)
    return q === "excellent" || q === "good"
  })
  const band = fast ?? strongest
  return { bands: [band], dbm, quality: quality(dbm[band]!) }
}
