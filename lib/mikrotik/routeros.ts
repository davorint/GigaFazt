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

/**
 * Queue type for the client queues: RouterOS's default, or an AQM that keeps
 * latency low under load. RouterOS v7 runs fq-codel and CAKE as the leaf
 * queue under the HTB limits of a simple queue or queue tree (manual 7.25);
 * fq-codel costs less CPU than CAKE.
 */
export type QueueKind = "default" | "fq-codel" | "cake"
export const QUEUE_KINDS: QueueKind[] = ["default", "fq-codel", "cake"]

/** Creates the queue type once (safe to run again); null for RouterOS's default. */
export function queueTypeSetup(kind: QueueKind | undefined): string | null {
  if (!kind || kind === "default") return null
  const name = rosString(kind)
  return `:if ([:len [/queue type find where name=${name}]] = 0) do={/queue type add name=${name} kind=${kind}}`
}

/** RouterOS one-liner: update the entry with this name if it exists, else add it. */
export function upsert(menu: string, name: string, setProps: string[], addProps: string[]): string {
  const q = rosString(name)
  return `:if ([:len [${menu} find where name=${q}]] > 0) do={${menu} set [find where name=${q}] ${setProps.join(" ")}} else={${menu} add ${addProps.join(" ")}}`
}

/** RouterOS one-liner: add only if nothing matches `where`. */
export function addIfMissing(menu: string, where: string, addProps: string[]): string {
  return `:if ([:len [${menu} find where ${where}]] = 0) do={${menu} add ${addProps.join(" ")}}`
}

/** Queue names without accents or other non-ASCII characters (comments keep the original). */
export function asciiName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .trim()
}

/**
 * HTB properties shared by simple queues and queue tree (one direction).
 * `full` also writes the values that are off (0), so a `set` clears an old burst.
 */
function htbProps(q: QueueParams, full = false): string[] {
  const out = [`max-limit=${rosRate(q.maxLimit)}`]
  if (burstEnabled(q)) {
    out.push(
      `burst-limit=${rosRate(q.burstLimit)}`,
      `burst-threshold=${rosRate(q.burstThreshold)}`,
      `burst-time=${rosTime(q.burstTime)}`
    )
  } else if (full) out.push("burst-limit=0", "burst-threshold=0", "burst-time=0s")
  if (q.limitAt > 0 || full) out.push(`limit-at=${rosRate(q.limitAt)}`)
  return out
}

/** Default simple queue / rate-limit priority (RouterOS: 1 highest … 8 lowest). */
export const DEFAULT_PRIORITY = 8

export type SimpleOpts = { name: string; target: string; parent?: string; priority?: number; comment?: string; queue?: QueueKind }

/**
 * Properties of a `/queue simple` entry: every value is target-upload/target-download.
 * `parent` and `priority` only when given (priority only works on child queues).
 * `full` also writes the values that are off, so a `set` clears an old burst or limit-at.
 */
export function simpleQueueProps(p: Pair, o: SimpleOpts, full = false): string[] {
  const props = [`name=${rosString(o.name)}`, `target=${o.target.trim() || "0.0.0.0/0"}`]
  if (o.parent?.trim()) props.push(`parent=${rosString(o.parent.trim())}`)
  if (o.priority !== undefined && o.priority !== DEFAULT_PRIORITY) props.push(`priority=${o.priority}/${o.priority}`)
  if (o.queue && o.queue !== "default") props.push(`queue=${rosString(`${o.queue}/${o.queue}`)}`)
  props.push(`max-limit=${pair(rosRate(p.up.maxLimit), rosRate(p.down.maxLimit))}`)
  if (anyBurst(p)) {
    // A direction without burst gets 0 (RouterOS: burst off for that side).
    const b = (q: QueueParams, v: (q: QueueParams) => string, off = "0") => (burstEnabled(q) ? v(q) : off)
    props.push(
      `burst-limit=${pair(b(p.up, (q) => rosRate(q.burstLimit)), b(p.down, (q) => rosRate(q.burstLimit)))}`,
      `burst-threshold=${pair(b(p.up, (q) => rosRate(q.burstThreshold)), b(p.down, (q) => rosRate(q.burstThreshold)))}`,
      `burst-time=${pair(b(p.up, (q) => rosTime(q.burstTime), "0s"), b(p.down, (q) => rosTime(q.burstTime), "0s"))}`
    )
  } else if (full) props.push("burst-limit=0/0", "burst-threshold=0/0", "burst-time=0s/0s")
  if (anyLimitAt(p) || full) props.push(`limit-at=${pair(rosRate(p.up.limitAt), rosRate(p.down.limitAt))}`)
  if (o.comment?.trim()) props.push(`comment=${rosString(o.comment.trim())}`)
  return props
}

/** One `add` line of `/queue simple`. */
export function simpleQueueLine(p: Pair, o: SimpleOpts): string {
  return `add ${simpleQueueProps(p, o).join(" ")}`
}

/** One line that updates the simple queue with this name if it exists, else adds it. */
export function simpleQueueUpsert(p: Pair, o: SimpleOpts): string {
  const set = simpleQueueProps(p, o, true).filter((x) => !x.startsWith("name="))
  return upsert("/queue simple", o.name, set, simpleQueueProps(p, o))
}

const withSetup = (kind: QueueKind | undefined, lines: string[]) => {
  const setup = queueTypeSetup(kind)
  return (setup ? [setup, ...lines] : lines).join("\n")
}

/** `/queue simple` for one client. */
export function simpleQueue(p: Pair, o: { name: string; target: string; queue?: QueueKind }): string {
  return withSetup(o.queue, ["/queue simple", simpleQueueLine(p, o)])
}

/** `/queue tree`: one queue per direction, matched by packet mark. */
export function queueTree(p: Pair, o: { name: string; parent: string; markUp: string; markDown: string; queue?: QueueKind }): string {
  const parent = o.parent.trim() || "global"
  const kind = o.queue && o.queue !== "default" ? [`queue=${rosString(o.queue)}`] : []
  const line = (suffix: string, mark: string, q: QueueParams) =>
    `add ${[`name=${rosString(`${o.name}-${suffix}`)}`, `parent=${parent}`, `packet-mark=${rosString(mark)}`, ...kind, ...htbProps(q)].join(" ")}`
  return withSetup(o.queue, ["/queue tree", line("down", o.markDown, p.down), line("up", o.markUp, p.up)])
}

/** One `/queue type` PCQ line (one direction). `full` writes burst 0 when off, for `set`. */
export function pcqProps(name: string, classifier: "dst-address" | "src-address", q: QueueParams, full = false): string[] {
  const props = [`name=${rosString(name)}`, "kind=pcq", `pcq-classifier=${classifier}`, `pcq-rate=${rosRate(q.maxLimit)}`]
  if (burstEnabled(q)) {
    props.push(`pcq-burst-rate=${rosRate(q.burstLimit)}`, `pcq-burst-threshold=${rosRate(q.burstThreshold)}`, `pcq-burst-time=${rosTime(q.burstTime)}`)
  } else if (full) props.push("pcq-burst-rate=0", "pcq-burst-threshold=0")
  return props
}

/** `/queue type` PCQ: the same rate and burst for every sub-stream (each client). */
export function pcqTypes(p: Pair, o: { name: string }): string {
  return [
    "/queue type",
    `add ${pcqProps(`${o.name}-down`, "dst-address", p.down).join(" ")}`,
    `add ${pcqProps(`${o.name}-up`, "src-address", p.up).join(" ")}`,
  ].join("\n")
}

/** Queue tree properties (one direction) for a `set`, clearing what's off. */
export function treeSetProps(q: QueueParams): string[] {
  return htbProps(q, true)
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

/** `queue-type` of a PPP profile (one value for both directions; 7.19+ also takes rx/tx). */
const pppQueueType = (kind: QueueKind | undefined) => (kind && kind !== "default" ? ` queue-type=${rosString(kind)}` : "")

export function pppProfile(p: Pair, o: { name: string; queue?: QueueKind }): string {
  return withSetup(o.queue, ["/ppp profile", `add name=${rosString(o.name)} rate-limit=${rosString(rateLimit(p))}${pppQueueType(o.queue)}`])
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
export function sharedSimpleQueues(o: { parent: string; target: string; maxLimit: number; children: Child[]; queue?: QueueKind }): string {
  const lines = o.children.map((c) => simpleQueueLine(c.pair, { name: c.name, target: c.target, parent: o.parent, priority: c.priority, queue: o.queue }))
  return withSetup(o.queue, ["/queue simple", parentLine(o.parent, o.target, o.maxLimit), ...lines])
}

/**
 * Profiles named from the plan speed, one per distinct rate-limit string
 * (-2, -3… when two plans share a speed but differ). Returns the profile
 * lines (without the menu) and each input's profile name.
 */
export function pppProfiles(
  items: { pair: Pair; priority?: number }[],
  o: { parentQueue?: string; queue?: QueueKind; upsert?: boolean } = {}
): { lines: string[]; names: string[] } {
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
  const lines = [...byLimit.entries()].map(([limit, name]) => {
    const props = [`rate-limit=${rosString(limit)}`]
    if (parent) props.push(`parent-queue=${rosString(parent)}`)
    if (o.queue && o.queue !== "default") props.push(`queue-type=${rosString(o.queue)}`)
    return o.upsert ? upsert("/ppp profile", name, props, [`name=${rosString(name)}`, ...props]) : `add name=${rosString(name)} ${props.join(" ")}`
  })
  return { lines, names }
}

/** Parent simple queue + PPP profiles whose dynamic queues hang from it (`parent-queue`). */
export function sharedPpp(o: { parent: string; target: string; maxLimit: number; children: { pair: Pair; priority: number }[]; queue?: QueueKind }): {
  script: string
  names: string[]
} {
  const { lines, names } = pppProfiles(o.children, { parentQueue: o.parent, queue: o.queue })
  return { script: withSetup(o.queue, ["/queue simple", parentLine(o.parent, o.target, o.maxLimit), "/ppp profile", ...lines]), names }
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

/**
 * User Manager v7: a limitation, a profile and the link between them, per
 * plan. With `upsert`, existing limitations are updated and the rest only
 * added when missing, so the script can run again.
 */
export function userManagerPlans(plans: UmPlan[], o: { upsert?: boolean } = {}): string {
  const lim = plans.map((pl) => {
    const props = limitationProps(pl.pair, pl.priority ?? DEFAULT_PRIORITY)
    if (!o.upsert) return `add name=${rosString(pl.name)} ${props.join(" ")}`
    // On update, clear burst / min values the new plan doesn't use.
    const clear = ["rate-limit-burst-rx", "rate-limit-burst-tx", "rate-limit-burst-threshold-rx", "rate-limit-burst-threshold-tx", "rate-limit-min-rx", "rate-limit-min-tx"]
      .filter((k) => !props.some((p) => p.startsWith(`${k}=`)))
      .map((k) => `${k}=0`)
    return upsert("/user-manager limitation", pl.name, [...props, ...clear], [`name=${rosString(pl.name)}`, ...props])
  })
  const profProps = (pl: UmPlan) => [`name=${rosString(pl.name)}`, `name-for-users=${rosString(pl.name)}`, "validity=unlimited"]
  const prof = plans.map((pl) =>
    o.upsert ? addIfMissing("/user-manager profile", `name=${rosString(pl.name)}`, profProps(pl)) : `add ${profProps(pl).join(" ")}`
  )
  const linkProps = (pl: UmPlan) => [`profile=${rosString(pl.name)}`, `limitation=${rosString(pl.name)}`]
  const link = plans.map((pl) =>
    o.upsert
      ? addIfMissing("/user-manager profile-limitation", `profile=${rosString(pl.name)} and limitation=${rosString(pl.name)}`, linkProps(pl))
      : `add ${linkProps(pl).join(" ")}`
  )
  return ["/user-manager limitation", ...lim, "/user-manager profile", ...prof, "/user-manager profile-limitation", ...link].join("\n")
}

// ── Setup checks shown next to every export ─────────────────────────────────

/** Lists FastTrack rules (they bypass simple queues and parent=global queue trees). */
export const FASTTRACK_CHECK = "/ip firewall filter print where action=fasttrack-connection"
/** Lets simple queues and parent=global queue trees see bridged (layer 2) traffic. */
export const BRIDGE_FIREWALL = "/interface bridge settings set use-ip-firewall=yes"
