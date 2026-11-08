/**
 * Wi-Fi generations and the apartment model behind "Así viaja el Wi-Fi por tu
 * depa" (components/fiber/WifiLab). Two kinds of data, both kept out of
 * components:
 *
 *  - GENERATIONS: public figures of each IEEE standard. `maxGbps` is the
 *    standard's theoretical maximum (max streams × widest channel × densest
 *    modulation), never a promise about our service. Not company facts.
 *  - The apartment, wall losses and the link model: an ILLUSTRATIVE simulation
 *    (hard rule #2: every surface that shows it carries SIMULACIÓN). Wall
 *    losses are approximate industry reference values and vary with the build.
 *
 * BUSINESS.md doesn't say which bands, channel widths or MLO the plan's Wi-Fi 7
 * modem supports, so the page simulates the standard, not our modem.
 */

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
  id: "wifi4" | "wifi5" | "wifi6" | "wifi6e" | "wifi7"
  /** Short name on the switcher ("4", "6E"…) and the full brand name. */
  short: string
  name: string
  ieee: string
  /** IEEE ratification (4, 5) or Wi-Fi Alliance certification launch (6, 6E, 7). */
  year: number
  bands: readonly BandId[]
  maxChannelMhz: number
  qam: number
  streams: number
  /** Theoretical maximum PHY rate of the standard, Gbps. */
  maxGbps: number
  /** One device can use several bands at the same time (Multi-Link Operation). */
  mlo: boolean
  tech: readonly TechId[]
}

export const GENERATIONS: readonly Generation[] = [
  { id: "wifi4", short: "4", name: "Wi-Fi 4", ieee: "802.11n", year: 2009, bands: ["b24", "b5"], maxChannelMhz: 40, qam: 64, streams: 4, maxGbps: 0.6, mlo: false, tech: ["mimo"] },
  { id: "wifi5", short: "5", name: "Wi-Fi 5", ieee: "802.11ac", year: 2013, bands: ["b5"], maxChannelMhz: 160, qam: 256, streams: 8, maxGbps: 6.9, mlo: false, tech: ["muMimo"] },
  { id: "wifi6", short: "6", name: "Wi-Fi 6", ieee: "802.11ax", year: 2019, bands: ["b24", "b5"], maxChannelMhz: 160, qam: 1024, streams: 8, maxGbps: 9.6, mlo: false, tech: ["ofdma", "twt"] },
  { id: "wifi6e", short: "6E", name: "Wi-Fi 6E", ieee: "802.11ax", year: 2021, bands: ["b24", "b5", "b6"], maxChannelMhz: 160, qam: 1024, streams: 8, maxGbps: 9.6, mlo: false, tech: ["band6"] },
  { id: "wifi7", short: "7", name: "Wi-Fi 7", ieee: "802.11be", year: 2024, bands: ["b24", "b5", "b6"], maxChannelMhz: 320, qam: 4096, streams: 16, maxGbps: 46, mlo: true, tech: ["mlo", "ch320", "qam4096"] },
]

export const MAX_CHANNEL_MHZ = Math.max(...GENERATIONS.map((g) => g.maxChannelMhz))

export function getGeneration(id: Generation["id"]): Generation {
  return GENERATIONS.find((g) => g.id === id) ?? GENERATIONS[GENERATIONS.length - 1]
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
