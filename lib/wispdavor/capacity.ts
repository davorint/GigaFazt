/**
 * Link capacity (WispDavor phase 13, owner 2026-11-22: "do all"): how full each deployment's carrier links get, from the
 * traffic the routers' agents report (5-minute buckets, bytes per PPPoE user) against the speeds written on the links in
 * Despliegues. Pure rules; the server sums the traffic (capacity-server.ts).
 *
 * - Busy hour: the hour of the last 7 days with the most average traffic (Mbps over that hour). Links are sized for
 *   the busy hour, not for a single 5-minute spike.
 * - Full: busy hour at or above FULL_SHARE of the links' speed (both ways compared; the fuller one counts) → an alert.
 * - Room for: how many more clients like today's fit before FULL_SHARE, at today's busy-hour use per active client.
 * The traffic is what the routers report; when a router reports every 10 minutes its traffic is spread over two buckets,
 * so short peaks look flatter. Labelled as an estimate on the page.
 */
import type { Client } from "../clients/model"
import type { Site } from "../sites/model"

export const FULL_SHARE = 0.8
export const DAYS = 7

export type Bucket = { at: string; down: number; up: number }
export type HourLoad = { hour: string; down: number; up: number }

/** Bytes in a 5-minute bucket → Mbps. */
export const mbps = (bytes: number, seconds = 300) => (bytes * 8) / seconds / 1e6

/** The site's links: total contracted speed both ways (null = no speed written on any link). */
export function linkSpeed(s: Site): { down: number | null; up: number | null; links: number } {
  let down = 0
  let up = 0
  let links = 0
  let anyDown = false
  let anyUp = false
  for (const r of s.rooms)
    for (const c of r.carriers) {
      links++
      if (c.downMbps) {
        down += c.downMbps
        anyDown = true
      }
      if (c.upMbps) {
        up += c.upMbps
        anyUp = true
      }
    }
  return { down: anyDown ? down : null, up: anyUp ? up : null, links }
}

/** Hourly averages (Mbps) from 5-minute buckets (a missing bucket in an hour counts as no traffic). */
export function hourly(buckets: Bucket[]): HourLoad[] {
  const m = new Map<string, { down: number; up: number }>()
  for (const b of buckets) {
    const h = `${b.at.slice(0, 13)}:00:00.000Z`
    const x = m.get(h) ?? { down: 0, up: 0 }
    x.down += b.down
    x.up += b.up
    m.set(h, x)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, x]) => ({ hour, down: mbps(x.down, 3600), up: mbps(x.up, 3600) }))
}

/** The average load per hour of the day (Mexico City), 0–23, for the "when is it busy" profile. */
export function dayProfile(hours: HourLoad[]): { h: number; down: number; up: number }[] {
  const acc = Array.from({ length: 24 }, (_, h) => ({ h, down: 0, up: 0, n: 0 }))
  for (const x of hours) {
    const h = Number(new Date(x.hour).toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }))
    acc[h].down += x.down
    acc[h].up += x.up
    acc[h].n++
  }
  return acc.map((a) => ({ h: a.h, down: a.n ? a.down / a.n : 0, up: a.n ? a.up / a.n : 0 }))
}

export type SiteCapacity = {
  siteId: string
  name: string
  speed: { down: number | null; up: number | null; links: number }
  busy: HourLoad | null
  /** Busy hour ÷ speed, the fuller direction (null without a speed or traffic). */
  use: number | null
  full: boolean
  activeClients: number
  /** Busy-hour Mbps per active client (download). */
  perClient: number | null
  /** More clients that fit before FULL_SHARE (null when it can't be told). */
  roomFor: number | null
  /** 5-minute peak (download Mbps), for reference. */
  peak: number
}

export function siteCapacity(s: Site, name: string, buckets: Bucket[], clients: Client[]): SiteCapacity {
  const speed = linkSpeed(s)
  const hours = hourly(buckets)
  const busy = hours.reduce<HourLoad | null>((a, h) => (!a || h.down + h.up > a.down + a.up ? h : a), null)
  const shares = busy ? [speed.down ? busy.down / speed.down : null, speed.up ? busy.up / speed.up : null].filter((x): x is number => x !== null) : []
  const use = shares.length ? Math.max(...shares) : null
  const activeClients = clients.filter((c) => c.siteId === s.id && c.services.some((x) => x.type === "internet" && x.status === "activo")).length
  const perClient = busy && activeClients ? busy.down / activeClients : null
  const roomFor = perClient && speed.down && perClient > 0 ? Math.max(0, Math.floor((FULL_SHARE * speed.down - (busy?.down ?? 0)) / perClient)) : null
  const peak = buckets.reduce((a, b) => Math.max(a, mbps(b.down)), 0)
  return { siteId: s.id, name, speed, busy, use, full: use !== null && use >= FULL_SHARE, activeClients, perClient, roomFor, peak }
}
