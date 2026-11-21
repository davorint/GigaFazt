/**
 * Monitoring (WispDavor phase 4, owner 2026-11-21): each router's agent also reports its carrier gateways' ping and,
 * a slice at a time, each connected client's ONT ping (owner: "carriers + sessions" and "every ONT"). From that and the
 * PPPoE sessions online, an outage opens when a deployment's sessions drop at once, when every carrier gateway stops
 * answering, or when the router stops reporting; the team is alerted and the deployment's clients see a banner in
 * their portal (owner: alert + portal banner; cut-offs keep running, no WhatsApp).
 *
 * Report lines (added to lib/wispdavor/routers.ts parseReport):
 *   g;ip;sent;received;avgRtt     a carrier gateway (each default route's gateway, every visit)
 *   o;user;sent;received;avgRtt   a connected client's ONT (its PPPoE address), up to ONT_SLICE per visit in turn
 * avgRtt comes from flood-ping (a time, per the manual) when the router's device-mode allows traffic-gen (off by default
 * in every mode); otherwise the plain ping only counts replies and avgRtt is empty (loss without latency).
 */

/** ONTs pinged per visit (every 2 minutes); the router goes round all connected ones in turn. Kept low: a plain ping
 * that gets no reply waits, and a visit must end well within 2 minutes. */
export const ONT_SLICE = 40
/** Sessions dropping to this share of the last half hour's peak (with at least MIN_SESSIONS) open an outage. */
export const DROP_TO = 0.5
/** An outage of sessions ends when they're back to this share of the peak before it. */
export const RECOVER_TO = 0.8
export const MIN_SESSIONS = 5
/** An ONT is flagged when its latency passes this or it loses pings. */
export const ONT_SLOW_MS = 50

export type Ping = { sent: number; received: number; rtt: number | null }
export type GatewayPing = Ping & { ip: string }
export type OntPing = Ping & { user: string }

/** flood-ping's average: "12", "12.5", "12ms", "1.2ms", "00:00:00.012" or "12ms345us" → ms; null when absent. */
export function parseRtt(s: string): number | null {
  const v = s.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v)
  const hms = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(v)
  if (hms) return (Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])) * 1000
  const unit = /^(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?(?:(\d+(?:\.\d+)?)us)?$/.exec(v)
  if (unit && (unit[1] || unit[2] || unit[3])) return Number(unit[1] ?? 0) * 1000 + Number(unit[2] ?? 0) + Number(unit[3] ?? 0) / 1000
  return null
}

const count = (s: string) => {
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null
}

/** A g/o line's fields after the kind and the name; null when malformed. */
export function parsePing(sent: string, received: string, rtt: string): Ping | null {
  const a = count(sent)
  const b = count(received)
  if (a === null || b === null || a === 0 || b > a) return null
  return { sent: a, received: b, rtt: b > 0 ? parseRtt(rtt) : null }
}

export const loss = (p: Ping) => (p.sent ? 1 - p.received / p.sent : 1)

export type OutageKind = "sesiones" | "carrier" | "router"
export type OpenOutage = { kind: OutageKind; baseline: number; low: number }
export type Step =
  | { action: "open"; kind: OutageKind; baseline: number; low: number }
  | { action: "close" }
  | { action: "low"; low: number }
  | null

/**
 * What a router's report does to its outage. `online` is its PPPoE sessions online now (null when the report didn't
 * say), `peak` the most online in the last half hour before it, `gateways` its carriers' pings.
 */
export function outageStep(open: OpenOutage | null, online: number | null, peak: number, gateways: GatewayPing[]): Step {
  const carriersDown = gateways.length > 0 && gateways.every((g) => g.received === 0)
  const dropped = online !== null && peak >= MIN_SESSIONS && online <= peak * DROP_TO
  if (!open) {
    if (carriersDown) return { action: "open", kind: "carrier", baseline: peak, low: online ?? 0 }
    if (dropped) return { action: "open", kind: "sesiones", baseline: peak, low: online }
    return null
  }
  // The router reported: it's back. A carrier outage ends when a gateway answers again; one of sessions when they're
  // back to most of what there was.
  if (open.kind === "router") return { action: "close" }
  if (open.kind === "carrier") return carriersDown ? (online !== null && online < open.low ? { action: "low", low: online } : null) : { action: "close" }
  if (online === null) return null
  if (online >= open.baseline * RECOVER_TO) return { action: "close" }
  return online < open.low ? { action: "low", low: online } : null
}

/** The ONTs worth a look: losing pings or slow. */
export const ontFlag = (rtt: number | null, lossShare: number | null) => (lossShare !== null && lossShare > 0) || (rtt !== null && rtt > ONT_SLOW_MS)
