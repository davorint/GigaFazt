import { plans } from "../plans"
import { DEFAULT_RULE, KINDS, planDefaults, type Pattern, type PatternKind, type PlanRule, type QueueParams } from "./burst"
import type { Pair } from "./routeros"

/**
 * State of the /mikrotik burst tool and its share link (#hash, so nothing
 * reaches the server or its logs). Plan presets read `lib/plans.ts`.
 */

export type Direction = "down" | "up"

export type LabState = {
  /** Plan id from lib/plans.ts, or "custom". */
  preset: string
  /** Plan speed: the most the client may get (burst-limit and max-limit stay at or under it). null = not checked. */
  planMbps: number | null
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
  /** Several clients under one parent queue. */
  group: GroupState
  /** How a plan speed becomes queue values (plan presets, compare, shared, capacity, bulk). */
  rule: PlanRule
  /** Busiest-hour capacity model. */
  capacity: CapacityState
}

export type CapacityState = {
  /** Uplink (parent queue) max-limit, Mbps. */
  parentMbps: number
  /** Clients per plan, in PRESETS order. */
  clients: number[]
  /** Share of clients transferring at any moment at the busiest hour, 0..1. */
  activeShare: number
  /** Mean length of each active stretch, s. */
  sessionS: number
  /** What an active client asks for, Mbps (null = everything its queue allows). */
  demandMbps: number | null
}

/** A client in the shared-parent simulation. */
export type GroupMember = {
  /** Plan id from lib/plans.ts (preset burst values), or "current" (the parameters above). */
  plan: string
  limitAt: number
  /** 1 (highest) … 8 (lowest). */
  priority: number
  kind: PatternKind
  startS: number
}

export type GroupState = {
  /** Parent queue max-limit (the shared link), Mbps. */
  parentMbps: number
  durationS: number
  members: GroupMember[]
}

export const MAX_MEMBERS = 6

export const DEFAULT_GROUP: GroupState = {
  parentMbps: 1000,
  durationS: 60,
  members: [
    { plan: "fibra-500", limitAt: 50, priority: 8, kind: "download", startS: 0 },
    { plan: "fibra-500", limitAt: 0, priority: 8, kind: "video", startS: 4 },
    { plan: "fibra-1g", limitAt: 0, priority: 8, kind: "speedtest", startS: 12 },
    { plan: "fibra-200", limitAt: 20, priority: 8, kind: "web", startS: 0 },
  ],
}

export type Preset = { id: string; downMbps: number; upMbps: number }

export const PRESETS: Preset[] = plans.map((p) => ({ id: p.id, downMbps: p.downMbps, upMbps: p.upMbps }))

/** Example busiest-hour setup: 600 clients split evenly (the split per plan is not known). */
export const DEFAULT_CAPACITY: CapacityState = {
  parentMbps: 10_000,
  clients: PRESETS.map(() => Math.round(600 / Math.max(1, PRESETS.length))),
  activeShare: 0.05,
  sessionS: 30,
  demandMbps: null,
}

export const DEFAULT_PATTERN: Pattern = {
  kind: "sustained",
  demandMbps: null,
  startS: 2,
  onS: 8,
  offS: 12,
  testS: 15,
  fileMB: 2000,
  videoMbps: 25,
  pageMB: 3,
}

export function presetState(preset: Preset, base?: LabState): LabState {
  const rule = base?.rule ?? DEFAULT_RULE
  return {
    preset: preset.id,
    planMbps: preset.downMbps,
    symmetric: preset.downMbps === preset.upMbps,
    down: planDefaults(preset.downMbps, rule),
    up: planDefaults(preset.upMbps, rule),
    view: base?.view ?? "down",
    pattern: base?.pattern ?? DEFAULT_PATTERN,
    durationS: base?.durationS ?? 60,
    lineCapMbps: base?.lineCapMbps ?? null,
    group: base?.group ?? DEFAULT_GROUP,
    rule,
    capacity: base?.capacity ?? DEFAULT_CAPACITY,
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

/** Queue values a plan preset starts with under a rule (download speed). */
export function presetParams(id: string, rule: PlanRule = DEFAULT_RULE): QueueParams | null {
  const preset = PRESETS.find((p) => p.id === id)
  return preset ? planDefaults(preset.downMbps, rule) : null
}

/** Queue and traffic of one shared-parent client. */
export function memberSetup(s: LabState, m: GroupMember): { params: QueueParams; pattern: Pattern } {
  const base = (m.plan === "current" ? null : presetParams(m.plan, s.rule)) ?? viewParams(s)
  return {
    params: { ...base, limitAt: m.limitAt },
    pattern: { ...s.pattern, kind: m.kind, startS: m.startS, demandMbps: null },
  }
}

/** Both directions of a shared-parent client, for the export (limit-at on both). */
export function memberPair(s: LabState, m: GroupMember): Pair {
  const preset = PRESETS.find((p) => p.id === m.plan)
  if (preset) {
    return {
      down: { ...planDefaults(preset.downMbps, s.rule), limitAt: m.limitAt },
      up: { ...planDefaults(preset.upMbps, s.rule), limitAt: m.limitAt },
    }
  }
  return { down: { ...s.down, limitAt: m.limitAt }, up: { ...(s.symmetric ? s.down : s.up), limitAt: m.limitAt } }
}

// ── Share link ──────────────────────────────────────────────────────────────

const num = (v: number) => String(Math.round(v * 1000) / 1000)
const q = (p: QueueParams) => [p.maxLimit, p.burstLimit, p.burstThreshold, p.burstTime, p.limitAt].map(num).join(",")

export function encodeState(s: LabState): string {
  const h = new URLSearchParams()
  h.set("p", s.preset)
  h.set("m", s.planMbps ? num(s.planMbps) : "")
  h.set("d", q(s.down))
  if (!s.symmetric) h.set("u", q(s.up))
  h.set("v", s.view)
  const pt = s.pattern
  h.set("t", [pt.kind, pt.demandMbps ?? "", pt.startS, pt.onS, pt.offS, pt.testS, pt.fileMB, pt.videoMbps, pt.pageMB].map(String).join(","))
  h.set("s", num(s.durationS))
  if (s.lineCapMbps) h.set("c", num(s.lineCapMbps))
  const g = s.group
  h.set("g", [[g.parentMbps, g.durationS].map(num).join(","), ...g.members.map((m) => [m.plan, num(m.limitAt), m.priority, m.kind, num(m.startS)].join(","))].join("~"))
  h.set("r", [s.rule.sustained, s.rule.threshold, s.rule.burstTime].map(num).join(","))
  const c = s.capacity
  h.set("k", [num(c.parentMbps), num(c.activeShare), num(c.sessionS), c.demandMbps === null ? "" : num(c.demandMbps), ...c.clients.map(num)].join(","))
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

function decodeGroup(v: string | null): GroupState | null {
  if (!v) return null
  const [head, ...rows] = v.split("~")
  const [parent, duration] = head.split(",")
  const parentMbps = finite(parent, 0.001)
  const durationS = finite(duration, 1, MAX_DURATION_S)
  if (parentMbps === null || durationS === null || rows.length === 0 || rows.length > MAX_MEMBERS) return null
  const members: GroupMember[] = []
  for (const row of rows) {
    const [plan, limitAt, priority, kind, startS] = row.split(",")
    const m = {
      plan: plan === "current" || PRESETS.some((p) => p.id === plan) ? plan : null,
      limitAt: finite(limitAt),
      priority: finite(priority, 1, 8),
      kind: KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : null,
      startS: finite(startS, 0, 3600),
    }
    if (m.plan === null || m.limitAt === null || m.priority === null || m.kind === null || m.startS === null) return null
    members.push({ plan: m.plan, limitAt: m.limitAt, priority: Math.round(m.priority), kind: m.kind, startS: m.startS })
  }
  return { parentMbps, durationS, members }
}

function decodeRule(v: string | null): PlanRule | null {
  if (!v) return null
  const [sustained, threshold, burstTime] = v.split(",").map((x) => finite(x))
  if (sustained === null || threshold === null || burstTime === null) return null
  if (!(sustained >= 0.01 && sustained <= 1) || !(threshold >= 0.01 && threshold <= 2) || !(burstTime >= 1 && burstTime <= 3600)) return null
  return { sustained, threshold, burstTime: Math.round(burstTime) }
}

function decodeCapacity(v: string | null): CapacityState | null {
  if (!v) return null
  const [parent, active, session, demand, ...counts] = v.split(",")
  const parentMbps = finite(parent, 0.001)
  const activeShare = finite(active, 0, 1)
  const sessionS = finite(session, 1, 3600)
  const demandMbps = demand === "" ? null : finite(demand, 0.001)
  const clients = counts.map((x) => finite(x, 0, MAX_CLIENTS_PER_PLAN))
  if (parentMbps === null || activeShare === null || sessionS === null || (demand !== "" && demandMbps === null)) return null
  if (clients.length !== PRESETS.length || clients.some((x) => x === null)) return null
  return { parentMbps, activeShare, sessionS, demandMbps, clients: (clients as number[]).map(Math.round) }
}

export const MAX_CLIENTS_PER_PLAN = 2000

/** Reads a share hash; anything malformed falls back to the defaults. */
export function decodeState(hash: string): LabState | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""))
  const down = decodeQueue(h.get("d"))
  if (!down) return null
  const up = decodeQueue(h.get("u"))
  const base = initialState()
  const [kind, demand, startS, onS, offS, testS, fileMB, videoMbps, pageMB] = (h.get("t") ?? "").split(",")
  const pattern: Pattern = {
    kind: KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : base.pattern.kind,
    demandMbps: finite(demand, 0.001),
    startS: finite(startS, 0, 3600) ?? base.pattern.startS,
    onS: finite(onS, 0.1, 3600) ?? base.pattern.onS,
    offS: finite(offS, 0, 3600) ?? base.pattern.offS,
    testS: finite(testS, 0.1, 3600) ?? base.pattern.testS,
    fileMB: finite(fileMB, 0.001) ?? base.pattern.fileMB,
    videoMbps: finite(videoMbps, 0.001, 1e4) ?? base.pattern.videoMbps,
    pageMB: finite(pageMB, 0.001, 1e4) ?? base.pattern.pageMB,
  }
  const preset = h.get("p") ?? "custom"
  const known = PRESETS.find((p) => p.id === preset)
  // Links from before the plan field: take the plan's speed.
  const planMbps = h.has("m") ? finite(h.get("m") ?? undefined, 0.001) : (known?.downMbps ?? null)
  return {
    preset: preset === "custom" || known ? preset : "custom",
    planMbps,
    symmetric: !up,
    down,
    up: up ?? down,
    view: h.get("v") === "up" ? "up" : "down",
    pattern,
    durationS: finite(h.get("s") ?? undefined, 1, MAX_DURATION_S) ?? base.durationS,
    lineCapMbps: finite(h.get("c") ?? undefined, 0.001),
    group: decodeGroup(h.get("g")) ?? base.group,
    // Links from before the rule field used the first tested rule.
    rule: decodeRule(h.get("r")) ?? DEFAULT_RULE,
    capacity: decodeCapacity(h.get("k")) ?? base.capacity,
  }
}

export const MAX_DURATION_S = 600
