/**
 * Reads burst settings back from RouterOS text: a `/queue simple` line, a
 * `/queue tree` pair, `/queue type` PCQ lines, a rate-limit string
 * (/ppp profile, hotspot user profile) or the RADIUS Mikrotik-Rate-Limit
 * attribute. The inverse of `routeros.ts`; anything it writes reads back.
 *
 * Rates accept bps or k/M/G (any case); times accept 16, 16s, 1m30s,
 * 500ms or 00:00:16. Values come back in Mbps and seconds.
 */

import type { QueueParams } from "./burst"

export type ImportSource = "simple" | "tree" | "pcq" | "rateLimit"

export type ImportNote =
  /** More than one queue in the text: only the first was read. */
  | "firstOnly"
  /** Queue tree/PCQ lines without a direction hint: first = download, second = upload. */
  | "assumedOrder"
  /** One direction only: used for both. */
  | "oneDirection"
  /** limit-at / burst values were missing: taken as 0 (off). */
  | "noBurst"
  /** rate-limit with a burst rate but no threshold/time: RouterOS uses the rate and 1 s. */
  | "burstDefaults"
  /** PCQ with a burst rate but no pcq-burst-time: RouterOS uses 10 s. */
  | "pcqTimeDefault"

export type ImportError = "empty" | "unrecognized" | "badValue" | "noMaxLimit"

export type ImportResult =
  | { ok: true; source: ImportSource; down: QueueParams; up: QueueParams; notes: ImportNote[] }
  | { ok: false; error: ImportError }

/** "10M" → 10, "512k" → 0.512, "1G" → 1000, "2000000" → 2 (Mbps). null if malformed. */
export function parseRate(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?)\s*$/i.exec(text)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  const bps = n * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit === "g" ? 1e9 : 1)
  return Math.round((bps / 1e6) * 1e6) / 1e6
}

/** "16" / "16s" / "1m30s" / "500ms" / "00:00:16" → seconds. null if malformed. */
export function parseTime(text: string): number | null {
  const s = text.trim().toLowerCase()
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  const clock = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  if (!/^(?:\d+(?:\.\d+)?(?:ms|w|d|h|m|s))+$/.test(s)) return null
  const unit: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1, ms: 0.001 }
  let total = 0
  for (const [, v, u] of s.matchAll(/(\d+(?:\.\d+)?)(ms|w|d|h|m|s)/g)) total += Number(v) * unit[u]
  return total
}

/** key=value pairs of one RouterOS line; quoted values unescaped. */
export function props(line: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of line.matchAll(/([a-z][a-z0-9-]*)=("(?:[^"\\]|\\.)*"|[^\s"]+)/gi)) {
    const raw = m[2]
    const value = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw
    out.set(m[1].toLowerCase(), value)
  }
  return out
}

/** "UP/DOWN" or a single value for both. */
function pair<T>(text: string | undefined, parse: (s: string) => T | null): { up: T; down: T; one: boolean } | null | undefined {
  if (text === undefined) return undefined
  const parts = text.split("/")
  if (parts.length > 2) return null
  const a = parse(parts[0])
  const b = parts.length === 2 ? parse(parts[1]) : a
  if (a === null || b === null) return null
  return { up: a, down: b, one: parts.length === 1 }
}

/** A burst-limit equal to max-limit is how RouterOS (and our export) writes "burst off". */
function normalize(q: QueueParams): QueueParams {
  if (q.burstLimit === q.maxLimit || q.burstLimit === 0 || q.burstTime === 0 || q.burstThreshold === 0) {
    return { ...q, burstLimit: 0, burstThreshold: 0, burstTime: 0 }
  }
  return q
}

export const sameQueue = (a: QueueParams, b: QueueParams) =>
  a.maxLimit === b.maxLimit && a.burstLimit === b.burstLimit && a.burstThreshold === b.burstThreshold && a.burstTime === b.burstTime && a.limitAt === b.limitAt

// ── Rate-limit string ───────────────────────────────────────────────────────

/** Default burst-time of a rate-limit string when it gives a burst rate but no time (RouterOS docs). */
export const RATE_LIMIT_DEFAULT_TIME = 1
/** Default pcq-burst-time of PCQ queue types (RouterOS docs). */
export const PCQ_DEFAULT_BURST_TIME = 10

/**
 * rx-rate[/tx-rate] [rx-burst[/tx-burst] [rx-threshold[/tx-threshold] [rx-time[/tx-time] [priority [rx-min[/tx-min]]]]]]
 * Seen from the router: rx = client upload, tx = client download. When the
 * burst rate is given without a threshold, RouterOS uses the rate as the
 * threshold; without a time, 1 s (Mikrotik-Rate-Limit docs).
 */
export function parseRateLimit(text: string): ImportResult {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { ok: false, error: "empty" }
  if (parts.length > 6) return { ok: false, error: "unrecognized" }
  const rate = pair(parts[0], parseRate)
  const burst = pair(parts[1], parseRate)
  const thr = pair(parts[2], parseRate)
  const time = pair(parts[3], parseTime)
  const min = pair(parts[5], parseRate)
  if (!rate || burst === null || thr === null || time === null || min === null) return { ok: false, error: "badValue" }
  if (parts[4] !== undefined && !/^[1-8]$/.test(parts[4])) return { ok: false, error: "badValue" }
  if (!(rate.up > 0) || !(rate.down > 0)) return { ok: false, error: "noMaxLimit" }
  const side = (d: "up" | "down"): QueueParams =>
    normalize({
      maxLimit: rate[d],
      burstLimit: burst?.[d] ?? 0,
      burstThreshold: thr?.[d] ?? (burst ? rate[d] : 0),
      burstTime: time?.[d] ?? (burst ? RATE_LIMIT_DEFAULT_TIME : 0),
      limitAt: min?.[d] ?? 0,
    })
  const notes: ImportNote[] = []
  if (!burst) notes.push("noBurst")
  else if (!thr || !time) notes.push("burstDefaults")
  return { ok: true, source: "rateLimit", up: side("up"), down: side("down"), notes }
}

// ── Whole text ──────────────────────────────────────────────────────────────

const DOWN_HINT = /(^|[^a-z])(down|download|dl|bajada|descarga)([^a-z]|$)/i
const UP_HINT = /(^|[^a-z])(up|upload|ul|subida|carga)([^a-z]|$)/i

function hint(p: Map<string, string>): "down" | "up" | null {
  const classifier = p.get("pcq-classifier") ?? ""
  if (/dst-address/.test(classifier)) return "down"
  if (/src-address/.test(classifier)) return "up"
  const text = [p.get("name"), p.get("packet-mark"), p.get("parent")].filter(Boolean).join(" ")
  const d = DOWN_HINT.test(text)
  const u = UP_HINT.test(text)
  return d === u ? null : d ? "down" : "up"
}

/** One direction of a queue tree or PCQ line. `defaultTime` applies when a burst rate is set without a time. */
export function oneWay(
  p: Map<string, string>,
  keys: { rate: string; burst: string; thr: string; time: string; min?: string; defaultTime?: number }
): QueueParams | null | "noMax" {
  const read = (k: string | undefined, parse: (s: string) => number | null) => {
    if (!k) return 0
    const v = p.get(k)
    if (v === undefined) return 0
    return parse(v)
  }
  const maxLimit = read(keys.rate, parseRate)
  const burstLimit = read(keys.burst, parseRate)
  const burstThreshold = read(keys.thr, parseRate)
  const burstTime = keys.defaultTime !== undefined && !p.has(keys.time) && p.has(keys.burst) ? keys.defaultTime : read(keys.time, parseTime)
  const limitAt = read(keys.min, parseRate)
  if ([maxLimit, burstLimit, burstThreshold, burstTime, limitAt].some((v) => v === null)) return null
  if (!((maxLimit as number) > 0)) return "noMax"
  return normalize({ maxLimit: maxLimit as number, burstLimit: burstLimit as number, burstThreshold: burstThreshold as number, burstTime: burstTime as number, limitAt: limitAt as number })
}

function twoLines(lines: Map<string, string>[], source: "tree" | "pcq", keys: Parameters<typeof oneWay>[1]): ImportResult {
  const parsed: { dir: "down" | "up" | null; q: QueueParams }[] = []
  for (const p of lines.slice(0, 2)) {
    const q = oneWay(p, keys)
    if (q === null) return { ok: false, error: "badValue" }
    if (q === "noMax") return { ok: false, error: "noMaxLimit" }
    parsed.push({ dir: hint(p), q })
  }
  const notes: ImportNote[] = []
  const burstNoTime = (p: Map<string, string>) => (parseRate(p.get(keys.burst) ?? "0") ?? 0) > 0 && !p.has(keys.time)
  if (keys.defaultTime !== undefined && lines.slice(0, 2).some(burstNoTime)) notes.push("pcqTimeDefault")
  if (lines.length > 2) notes.push("firstOnly")
  if (parsed.length === 1) {
    notes.push("oneDirection")
    return { ok: true, source, down: parsed[0].q, up: parsed[0].q, notes }
  }
  let [a, b] = parsed
  if (a.dir === "up" || b.dir === "down") [a, b] = [b, a]
  if (!(a.dir === "down" || b.dir === "up")) notes.push("assumedOrder")
  return { ok: true, source, down: a.q, up: b.q, notes }
}

/**
 * Both directions of one `/queue simple` line (upload/download pairs). A
 * missing max-limit or a 0 (no limit in that direction) comes back as 0.
 * null if a value can't be read.
 */
export function readSimple(p: Map<string, string>): { up: QueueParams; down: QueueParams; burst: boolean } | null {
  const max = pair(p.get("max-limit") ?? "0/0", parseRate)
  const burst = pair(p.get("burst-limit"), parseRate)
  const thr = pair(p.get("burst-threshold"), parseRate)
  const time = pair(p.get("burst-time"), parseTime)
  const min = pair(p.get("limit-at"), parseRate)
  if (!max || burst === null || thr === null || time === null || min === null) return null
  const side = (d: "up" | "down"): QueueParams =>
    normalize({ maxLimit: max[d], burstLimit: burst?.[d] ?? 0, burstThreshold: thr?.[d] ?? 0, burstTime: time?.[d] ?? 0, limitAt: min?.[d] ?? 0 })
  return { up: side("up"), down: side("down"), burst: !!burst }
}

/** Joins RouterOS line continuations (a backslash at the end of a line) and drops comment lines. */
export function cleanExport(text: string): string {
  return text.replace(/\\\r?\n\s*/g, "").replace(/^\s*#.*$/gm, "")
}

export function parseRouterOS(text: string): ImportResult {
  // Join RouterOS line continuations and drop comments.
  const clean = cleanExport(text)
  if (!clean.trim()) return { ok: false, error: "empty" }

  // RADIUS attribute or a bare quoted/unquoted rate-limit string.
  const radius = /Mikrotik-Rate-Limit\s*:?=\s*("(?:[^"\\]|\\.)*"|[^\r\n]+)/i.exec(clean)
  if (radius) return parseRateLimit(radius[1].trim().replace(/^"|"$/g, ""))

  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(props)
    .filter((p) => p.size > 0)

  const rl = lines.find((p) => p.has("rate-limit"))
  if (rl) return parseRateLimit(rl.get("rate-limit") as string)

  const pcq = lines.filter((p) => p.has("pcq-rate"))
  if (pcq.length)
    return twoLines(pcq, "pcq", {
      rate: "pcq-rate",
      burst: "pcq-burst-rate",
      thr: "pcq-burst-threshold",
      time: "pcq-burst-time",
      defaultTime: PCQ_DEFAULT_BURST_TIME,
    })

  const queues = lines.filter((p) => p.has("max-limit"))
  if (queues.length) {
    // Simple queues carry upload/download pairs (or a target); queue tree lines a parent.
    const simple = queues.some((p) => p.has("target") || (p.get("max-limit") ?? "").includes("/"))
    if (!simple) return twoLines(queues, "tree", { rate: "max-limit", burst: "burst-limit", thr: "burst-threshold", time: "burst-time", min: "limit-at" })
    const q = readSimple(queues[0])
    if (q === null) return { ok: false, error: "badValue" }
    if (!(q.up.maxLimit > 0) || !(q.down.maxLimit > 0)) return { ok: false, error: "noMaxLimit" }
    const notes: ImportNote[] = []
    if (queues.length > 1) notes.push("firstOnly")
    if (!q.burst) notes.push("noBurst")
    return { ok: true, source: "simple", up: q.up, down: q.down, notes }
  }

  // A bare rate-limit string ("10M/20M 20M/40M …").
  const bare = clean.trim().replace(/^"|"$/g, "")
  if (/^\d+(?:\.\d+)?[kmg]?(?:\/\d+(?:\.\d+)?[kmg]?)?(?:\s|$)/i.test(bare)) return parseRateLimit(bare)
  return { ok: false, error: "unrecognized" }
}
