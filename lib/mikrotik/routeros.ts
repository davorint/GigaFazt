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

/** `/queue simple`: every value is target-upload/target-download. */
export function simpleQueue(p: Pair, o: { name: string; target: string }): string {
  const props = [`name=${rosString(o.name)}`, `target=${o.target.trim() || "0.0.0.0/0"}`]
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
  return `/queue simple\nadd ${props.join(" ")}`
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
export function rateLimit(p: Pair, priority = 8): string {
  const parts = [pair(rosRate(p.up.maxLimit), rosRate(p.down.maxLimit))]
  const limitAt = anyLimitAt(p)
  if (anyBurst(p) || limitAt) {
    // Without burst, RouterOS needs the positions filled to reach min rates:
    // burst = rate and threshold = rate turn burst off for that direction.
    const bl = (q: QueueParams) => rosRate(burstEnabled(q) ? q.burstLimit : q.maxLimit)
    const bt = (q: QueueParams) => rosRate(burstEnabled(q) ? q.burstThreshold : q.maxLimit)
    const time = (q: QueueParams) => `${burstEnabled(q) ? Math.round(q.burstTime) : 1}`
    parts.push(pair(bl(p.up), bl(p.down)), pair(bt(p.up), bt(p.down)), pair(time(p.up), time(p.down)))
  }
  if (limitAt) parts.push(`${priority}`, pair(rosRate(p.up.limitAt), rosRate(p.down.limitAt)))
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
