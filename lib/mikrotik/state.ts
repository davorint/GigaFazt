import { plans } from "../plans"
import { defaultsFor, type Pattern, type PatternKind, type QueueParams } from "./burst"

/**
 * State of the /mikrotik burst tool and its share link (#hash, so nothing
 * reaches the server or its logs). Plan presets read `lib/plans.ts`.
 */

export type Direction = "down" | "up"

export type LabState = {
  /** Plan id from lib/plans.ts, or "custom". */
  preset: string
  /** One set of values for both directions. */
  symmetric: boolean
  down: QueueParams
  up: QueueParams
  /** Direction shown in the simulator. */
  view: Direction
  pattern: Pattern
  durationS: number
  /** Physical access cap, Mbps (null = none). */
  lineCapMbps: number | null
}

export type Preset = { id: string; downMbps: number; upMbps: number }

export const PRESETS: Preset[] = plans.map((p) => ({ id: p.id, downMbps: p.downMbps, upMbps: p.upMbps }))

export const DEFAULT_PATTERN: Pattern = {
  kind: "sustained",
  demandMbps: null,
  startS: 2,
  onS: 8,
  offS: 12,
  testS: 15,
}

export function presetState(preset: Preset, base?: LabState): LabState {
  return {
    preset: preset.id,
    symmetric: preset.downMbps === preset.upMbps,
    down: defaultsFor(preset.downMbps),
    up: defaultsFor(preset.upMbps),
    view: base?.view ?? "down",
    pattern: base?.pattern ?? DEFAULT_PATTERN,
    durationS: base?.durationS ?? 60,
    lineCapMbps: base?.lineCapMbps ?? null,
  }
}

export function initialState(): LabState {
  const preset = PRESETS.find((p) => p.id === "fibra-500") ?? PRESETS[0]
  return presetState(preset)
}

/** Parameters the simulator shows (download when symmetric). */
export function viewParams(s: LabState): QueueParams {
  return s.symmetric || s.view === "down" ? s.down : s.up
}

// ── Share link ──────────────────────────────────────────────────────────────

const KINDS: PatternKind[] = ["sustained", "intermittent", "speedtest"]
const num = (v: number) => String(Math.round(v * 1000) / 1000)
const q = (p: QueueParams) => [p.maxLimit, p.burstLimit, p.burstThreshold, p.burstTime, p.limitAt].map(num).join(",")

export function encodeState(s: LabState): string {
  const h = new URLSearchParams()
  h.set("p", s.preset)
  h.set("d", q(s.down))
  if (!s.symmetric) h.set("u", q(s.up))
  h.set("v", s.view)
  const pt = s.pattern
  h.set("t", [pt.kind, pt.demandMbps ?? "", pt.startS, pt.onS, pt.offS, pt.testS].join(","))
  h.set("s", num(s.durationS))
  if (s.lineCapMbps) h.set("c", num(s.lineCapMbps))
  return h.toString()
}

const finite = (v: string | undefined, min = 0, max = 1e6): number | null => {
  if (v === undefined || v.trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function decodeQueue(v: string | null): QueueParams | null {
  if (!v) return null
  const parts = v.split(",").map((x) => finite(x))
  if (parts.length !== 5 || parts.some((x) => x === null)) return null
  const [maxLimit, burstLimit, burstThreshold, burstTime, limitAt] = parts as number[]
  if (!(maxLimit > 0)) return null
  return { maxLimit, burstLimit, burstThreshold, burstTime: Math.round(burstTime), limitAt }
}

/** Reads a share hash; anything malformed falls back to the defaults. */
export function decodeState(hash: string): LabState | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""))
  const down = decodeQueue(h.get("d"))
  if (!down) return null
  const up = decodeQueue(h.get("u"))
  const base = initialState()
  const [kind, demand, startS, onS, offS, testS] = (h.get("t") ?? "").split(",")
  const pattern: Pattern = {
    kind: KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : base.pattern.kind,
    demandMbps: finite(demand, 0.001),
    startS: finite(startS, 0, 3600) ?? base.pattern.startS,
    onS: finite(onS, 0.1, 3600) ?? base.pattern.onS,
    offS: finite(offS, 0, 3600) ?? base.pattern.offS,
    testS: finite(testS, 0.1, 3600) ?? base.pattern.testS,
  }
  const preset = h.get("p") ?? "custom"
  return {
    preset: preset === "custom" || PRESETS.some((p) => p.id === preset) ? preset : "custom",
    symmetric: !up,
    down,
    up: up ?? down,
    view: h.get("v") === "up" ? "up" : "down",
    pattern,
    durationS: finite(h.get("s") ?? undefined, 1, MAX_DURATION_S) ?? base.durationS,
    lineCapMbps: finite(h.get("c") ?? undefined, 0.001),
  }
}

export const MAX_DURATION_S = 600
