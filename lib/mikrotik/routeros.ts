import { burstEnabled, type QueueParams } from "./burst"

/**
 * RouterOS command text for the burst tool. Rates use only the `k` and `M`
 * suffixes (the Mikrotik-Rate-Limit docs list just those; queues accept them
 * too), so 1 Gbps is written 1000M. Values are rounded to whole kbps.
 */
export function rosRate(mbps: number): string {
  const kbps = Math.max(0, Math.round(mbps * 1000))
  if (kbps === 0) return "0"
  return kbps % 1000 === 0 ? `${kbps / 1000}M` : `${kbps}k`
}

/** burst-time for queue properties: whole seconds with the unit. */
export function rosTime(seconds: number): string {
  return `${Math.max(0, Math.round(seconds))}s`
}

/** Quoted RouterOS string value. */
export function rosString(value: string): string {
  return `"${value.replace(/["\\$]/g, (c) => `\\${c}`)}"`
}

export type Pair = { up: QueueParams; down: QueueParams }

const pair = (up: string, down: string) => `${up}/${down}`
const anyBurst = (p: Pair) => burstEnabled(p.up) || burstEnabled(p.down)
const anyLimitAt = (p: Pair) => p.up.limitAt > 0 || p.down.limitAt > 0

/** HTB properties shared by simple queues and queue tree (one direction). */
function htbProps(q: QueueParams): string[] {
  const out = [`max-limit=${rosRate(q.maxLimit)}`]
  if (burstEnabled(q)) {
    out.push(
      `burst-limit=${rosRate(q.burstLimit)}`,
      `burst-threshold=${rosRate(q.burstThreshold)}`,
      `burst-time=${rosTime(q.burstTime)}`
    )
  }
  if (q.limitAt > 0) out.push(`limit-at=${rosRate(q.limitAt)}`)
  return out
}

/** Default simple queue / rate-limit priority (RouterOS: 1 highest … 8 lowest). */
export const DEFAULT_PRIORITY = 8

/**
 * One `add` line of `/queue simple`: every value is target-upload/target-download.
 * `parent` and `priority` only when given (priority only works on child queues).
 */
export function simpleQueueLine(p: Pair, o: { name: string; target: string; parent?: string; priority?: number; comment?: string }): string {
  const props = [`name=${rosString(o.name)}`, `target=${o.target.trim() || "0.0.0.0/0"}`]
  if (o.parent?.trim()) props.push(`parent=${rosString(o.parent.trim())}`)
  if (o.priority !== undefined && o.priority !== DEFAULT_PRIORITY) props.push(`priority=${o.priority}/${o.priority}`)
  props.push(`max-limit=${pair(rosRate(p.up.maxLimit), rosRate(p.down.maxLimit))}`)
  if (anyBurst(p)) {
    // A direction without burst gets 0 (RouterOS: burst off for that side).
    const b = (q: QueueParams, v: (q: QueueParams) => string, off = "0") => (burstEnabled(q) ? v(q) : off)
    props.push(
      `burst-limit=${pair(b(p.up, (q) => rosRate(q.burstLimit)), b(p.down, (q) => rosRate(q.burstLimit)))}`,
      `burst-threshold=${pair(b(p.up, (q) => rosRate(q.burstThreshold)), b(p.down, (q) => rosRate(q.burstThreshold)))}`,
      `burst-time=${pair(b(p.up, (q) => rosTime(q.burstTime), "0s"), b(p.down, (q) => rosTime(q.burstTime), "0s"))}`
    )
  }
  if (anyLimitAt(p)) props.push(`limit-at=${pair(rosRate(p.up.limitAt), rosRate(p.down.limitAt))}`)
  if (o.comment?.trim()) props.push(`comment=${rosString(o.comment.trim())}`)
  return `add ${props.join(" ")}`
}

/** `/queue simple` for one client. */
export function simpleQueue(p: Pair, o: { name: string; target: string }): string {
  return `/queue simple\n${simpleQueueLine(p, o)}`
}

/** `/queue tree`: one queue per direction, matched by packet mark. */
export function queueTree(p: Pair, o: { name: string; parent: string; markUp: string; markDown: string }): string {
  const parent = o.parent.trim() || "global"
  const line = (suffix: string, mark: string, q: QueueParams) =>
    `add ${[`name=${rosString(`${o.name}-${suffix}`)}`, `parent=${parent}`, `packet-mark=${rosString(mark)}`, ...htbProps(q)].join(" ")}`
  return ["/queue tree", line("down", o.markDown, p.down), line("up", o.markUp, p.up)].join("\n")
}

/** `/queue type` PCQ: the same rate and burst for every sub-stream (each client). */
export function pcqTypes(p: Pair, o: { name: string }): string {
  const line = (suffix: string, classifier: string, q: QueueParams) => {
    const props = [`name=${rosString(`${o.name}-${suffix}`)}`, "kind=pcq", `pcq-classifier=${classifier}`, `pcq-rate=${rosRate(q.maxLimit)}`]
    if (burstEnabled(q)) {
      props.push(
        `pcq-burst-rate=${rosRate(q.burstLimit)}`,
        `pcq-burst-threshold=${rosRate(q.burstThreshold)}`,
        `pcq-burst-time=${rosTime(q.burstTime)}`
      )
    }
    return `add ${props.join(" ")}`
  }
  return ["/queue type", line("down", "dst-address", p.down), line("up", "src-address", p.up)].join("\n")
}

/**
 * Rate-limit string for /ppp profile, hotspot user profiles and the RADIUS
 * Mikrotik-Rate-Limit attribute, seen from the router: rx = client upload,
 * tx = client download.
 * rx-rate/tx-rate [rx-burst/tx-burst [rx-thr/tx-thr [rx-time/tx-time [priority [rx-min/tx-min]]]]]
 */
export function rateLimit(p: Pair, priority = DEFAULT_PRIORITY): string {
  const parts = [pair(rosRate(p.up.maxLimit), rosRate(p.down.maxLimit))]
  const limitAt = anyLimitAt(p)
  const prio = priority !== DEFAULT_PRIORITY
  if (anyBurst(p) || limitAt || prio) {
    // Without burst, RouterOS needs the positions filled to reach min rates:
    // burst = rate and threshold = rate turn burst off for that direction.
    const bl = (q: QueueParams) => rosRate(burstEnabled(q) ? q.burstLimit : q.maxLimit)
    const bt = (q: QueueParams) => rosRate(burstEnabled(q) ? q.burstThreshold : q.maxLimit)
    const time = (q: QueueParams) => `${burstEnabled(q) ? Math.round(q.burstTime) : 1}`
    parts.push(pair(bl(p.up), bl(p.down)), pair(bt(p.up), bt(p.down)), pair(time(p.up), time(p.down)))
  }
  if (limitAt || prio) parts.push(`${priority}`)
  if (limitAt) parts.push(pair(rosRate(p.up.limitAt), rosRate(p.down.limitAt)))
  return parts.join(" ")
}

export function pppProfile(p: Pair, o: { name: string }): string {
  return `/ppp profile\nadd name=${rosString(o.name)} rate-limit=${rosString(rateLimit(p))}`
}

export function hotspotProfile(p: Pair, o: { name: string }): string {
  return `/ip hotspot user profile\nadd name=${rosString(o.name)} rate-limit=${rosString(rateLimit(p))}`
}

export function radiusAttribute(p: Pair): string {
  return `Mikrotik-Rate-Limit = ${rosString(rateLimit(p))}`
}

// ── Several clients ─────────────────────────────────────────────────────────

/** A queue (or profile) name from the most the client gets: "plan-500M". */
export function planName(p: Pair): string {
  const top = (q: QueueParams) => (burstEnabled(q) ? q.burstLimit : q.maxLimit)
  return `plan-${rosRate(Math.max(top(p.down), top(p.up)))}`
}

export type Child = { name: string; target: string; pair: Pair; priority: number }

const parentLine = (name: string, target: string, maxLimit: number) =>
  `add name=${rosString(name)} target=${target.trim() || "0.0.0.0/0"} max-limit=${pair(rosRate(maxLimit), rosRate(maxLimit))}`

/** Parent simple queue (the shared link) and one child queue per client. */
export function sharedSimpleQueues(o: { parent: string; target: string; maxLimit: number; children: Child[] }): string {
  const lines = o.children.map((c) => simpleQueueLine(c.pair, { name: c.name, target: c.target, parent: o.parent, priority: c.priority }))
  return ["/queue simple", parentLine(o.parent, o.target, o.maxLimit), ...lines].join("\n")
}

/**
 * Profiles named from the plan speed, one per distinct rate-limit string
 * (-2, -3… when two plans share a speed but differ). Returns the profile
 * lines (without the menu) and each input's profile name.
 */
export function pppProfiles(items: { pair: Pair; priority?: number }[], o: { parentQueue?: string } = {}): { lines: string[]; names: string[] } {
  const byLimit = new Map<string, string>()
  const used = new Set<string>()
  const names = items.map((it) => {
    const priority = it.priority ?? DEFAULT_PRIORITY
    const limit = rateLimit(it.pair, priority)
    const known = byLimit.get(limit)
    if (known) return known
    const base = `${planName(it.pair)}${priority !== DEFAULT_PRIORITY ? `-p${priority}` : ""}`
    let name = base
    for (let k = 2; used.has(name); k++) name = `${base}-${k}`
    used.add(name)
    byLimit.set(limit, name)
    return name
  })
  const parent = o.parentQueue?.trim()
  const lines = [...byLimit.entries()].map(
    ([limit, name]) => `add name=${rosString(name)} rate-limit=${rosString(limit)}${parent ? ` parent-queue=${rosString(parent)}` : ""}`
  )
  return { lines, names }
}

/** Parent simple queue + PPP profiles whose dynamic queues hang from it (`parent-queue`). */
export function sharedPpp(o: { parent: string; target: string; maxLimit: number; children: { pair: Pair; priority: number }[] }): {
  script: string
  names: string[]
} {
  const { lines, names } = pppProfiles(o.children, { parentQueue: o.parent })
  return { script: ["/queue simple", parentLine(o.parent, o.target, o.maxLimit), "/ppp profile", ...lines].join("\n"), names }
}

/** Rate in bits per second (User Manager limitation fields are plain numbers). */
export function rosBps(mbps: number): string {
  return String(Math.max(0, Math.round(mbps * 1e6)))
}

/**
 * `/user-manager limitation` properties (RouterOS v7), seen from the router
 * like Mikrotik-Rate-Limit: rx = client upload, tx = client download. A
 * direction without burst gets burst = rate (burst off), as in the
 * rate-limit string.
 */
function limitationProps(p: Pair, priority: number): string[] {
  const out = [`rate-limit-rx=${rosBps(p.up.maxLimit)}`, `rate-limit-tx=${rosBps(p.down.maxLimit)}`]
  if (anyBurst(p)) {
    const on = (q: QueueParams) => burstEnabled(q)
    out.push(
      `rate-limit-burst-rx=${rosBps(on(p.up) ? p.up.burstLimit : p.up.maxLimit)}`,
      `rate-limit-burst-tx=${rosBps(on(p.down) ? p.down.burstLimit : p.down.maxLimit)}`,
      `rate-limit-burst-threshold-rx=${rosBps(on(p.up) ? p.up.burstThreshold : p.up.maxLimit)}`,
      `rate-limit-burst-threshold-tx=${rosBps(on(p.down) ? p.down.burstThreshold : p.down.maxLimit)}`,
      `rate-limit-burst-time-rx=${rosTime(on(p.up) ? p.up.burstTime : 1)}`,
      `rate-limit-burst-time-tx=${rosTime(on(p.down) ? p.down.burstTime : 1)}`
    )
  }
  if (anyLimitAt(p)) out.push(`rate-limit-min-rx=${rosBps(p.up.limitAt)}`, `rate-limit-min-tx=${rosBps(p.down.limitAt)}`)
  if (priority !== DEFAULT_PRIORITY) out.push(`rate-limit-priority=${priority}`)
  return out
}

export type UmPlan = { name: string; pair: Pair; priority?: number }

/** User Manager v7: a limitation, a profile and the link between them, per plan. */
export function userManagerPlans(plans: UmPlan[]): string {
  const lim = plans.map((pl) => `add name=${rosString(pl.name)} ${limitationProps(pl.pair, pl.priority ?? DEFAULT_PRIORITY).join(" ")}`)
  const prof = plans.map((pl) => `add name=${rosString(pl.name)} name-for-users=${rosString(pl.name)} validity=unlimited`)
  const link = plans.map((pl) => `add profile=${rosString(pl.name)} limitation=${rosString(pl.name)}`)
  return ["/user-manager limitation", ...lim, "/user-manager profile", ...prof, "/user-manager profile-limitation", ...link].join("\n")
}

// ── Setup checks shown next to every export ─────────────────────────────────

/** Lists FastTrack rules (they bypass simple queues and parent=global queue trees). */
export const FASTTRACK_CHECK = "/ip firewall filter print where action=fasttrack-connection"
/** Lets simple queues and parent=global queue trees see bridged (layer 2) traffic. */
export const BRIDGE_FIREWALL = "/interface bridge settings set use-ip-firewall=yes"
