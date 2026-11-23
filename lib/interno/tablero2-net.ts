/**
 * Tablero 2, carriers and continuity (owner, 2026-11-22: "connections with the carriers, speed of service, continuity,
 * and suggest something"). Pure figures over what the routers' agents report (lib/wispdavor/monitor.ts): each carrier
 * gateway's ping (sent, received, average RTT) every visit, the PPPoE sessions online, the outages, each ONT's ping and
 * the traffic. The server gathers them (tablero2-server.ts); everything here is testable without a database.
 *
 * - Pulse: per carrier gateway, hourly median and 95th-percentile latency and the share of pings lost (7 days).
 * - Continuity: per router, every hour of the last 30 days as ok / degraded (pings lost) / outage / no data, and the
 *   availability since it first reported (outage time ÷ time watched).
 * - Hourglass: per deployment, the speed sold (sum of the active plans), the links' speed and the busy-hour use.
 * - Packet path: per deployment, latency home ONT → router and router → carrier.
 * - Saturation forecast (the suggestion): the daily busy-hour use of each deployment's links, a straight-line trend over
 *   the last six weeks and the day it would cross FULL_SHARE. An estimate, labelled as such.
 */
import { clientStatus, type Client } from "../clients/model"
import { siteLabel, type Site } from "../sites/model"
import { FULL_SHARE, linkSpeed } from "../wispdavor/capacity"
import type { OutageKind } from "../wispdavor/monitor"

export type GatewayHour = { t: string; rtt: number | null; p95: number | null; loss: number }
export type GatewaySeries = { routerId: string; router: string; siteId: string; ip: string; hours: GatewayHour[] }
export type OutageSpan = { kind: OutageKind; start: string; end: string }
export type RouterContinuity = { routerId: string; router: string; siteId: string; hours: { t: string; lossy: boolean }[]; outages: OutageSpan[] }
export type PathStat = { routerId: string; siteId: string; gatewayRtt: number | null; ontRtt: number | null; ontP90: number | null; onts: number; ontLossy: number }
export type DailyBusy = { siteId: string; days: { day: string; down: number; up: number }[] }
export type CarrierFigures = { now: string; gateways: GatewaySeries[]; continuity: RouterContinuity[]; path: PathStat[]; daily: DailyBusy[] }

const HOUR = 3600000

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}

// ── Pulse ───────────────────────────────────────────────────────────────────

/** The carrier a gateway belongs to: the deployment's only link, or the link whose public IP shares the /24; else "". */
export function carrierOf(sites: Site[], siteId: string, ip: string): string {
  const s = sites.find((x) => x.id === siteId)
  if (!s) return ""
  const links = s.rooms.flatMap((r) => r.carriers)
  if (links.length === 1) return links[0].name.trim()
  const net = ip.split(".").slice(0, 3).join(".")
  return links.find((c) => c.ip.split(".").slice(0, 3).join(".") === net && /^\d+\.\d+\.\d+\.\d+$/.test(c.ip.trim()))?.name.trim() ?? ""
}

/** A gateway's week: median latency over its hours, the 95th percentile of its hourly highs, pings lost overall. */
export function gatewayStats(hours: GatewayHour[]): { rtt: number | null; p95: number | null; loss: number | null } {
  const rtts = hours.map((h) => h.rtt).filter((v): v is number => v !== null)
  const highs = hours.map((h) => h.p95).filter((v): v is number => v !== null)
  return { rtt: quantile(rtts, 0.5), p95: quantile(highs, 0.95), loss: hours.length ? hours.reduce((a, h) => a + h.loss, 0) / hours.length : null }
}

// ── Continuity ──────────────────────────────────────────────────────────────

/** 0 = no report, 1 = ok, 2 = pings lost, 3 = outage. */
export type Cell = 0 | 1 | 2 | 3
export type Strip = { from: number; cells: Cell[]; availability: number | null; downMinutes: number; outages: number }

/** Merged outage intervals (ms), clipped to [from, to]. */
function spans(outages: OutageSpan[], from: number, to: number): [number, number][] {
  const xs = outages
    .map((o) => [Math.max(from, Date.parse(o.start)), Math.min(to, o.end ? Date.parse(o.end) : to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const x of xs) {
    const last = out[out.length - 1]
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1])
    else out.push([...x])
  }
  return out
}

/** The router's last `days` days hour by hour, and its availability since its first report (or outage) in that window. */
export function continuityStrip(c: RouterContinuity, now: number, days = 30): Strip {
  const end = Math.floor(now / HOUR) * HOUR + HOUR
  const from = end - days * 24 * HOUR
  const seen = new Map<number, boolean>()
  for (const h of c.hours) {
    const t = Math.floor(Date.parse(h.t) / HOUR) * HOUR
    seen.set(t, (seen.get(t) ?? false) || h.lossy)
  }
  const down = spans(c.outages, from, now)
  const cells: Cell[] = Array.from({ length: days * 24 }, (_, i) => {
    const a = from + i * HOUR
    if (down.some(([s, e]) => s < a + HOUR && e > a)) return 3
    if (!seen.has(a)) return 0
    return seen.get(a) ? 2 : 1
  })
  const first = cells.findIndex((x) => x !== 0)
  const watched = first < 0 ? 0 : now - (from + first * HOUR)
  const lost = down.reduce((a, [s, e]) => a + (e - s), 0)
  return { from, cells, availability: watched > 0 ? Math.max(0, 1 - lost / watched) : null, downMinutes: Math.round(lost / 60000), outages: c.outages.filter((o) => (o.end ? Date.parse(o.end) : now) > from).length }
}

/** Consecutive cells of the same kind, for drawing a strip as a few rectangles. */
export function runs(cells: Cell[]): { from: number; to: number; cell: Cell }[] {
  const out: { from: number; to: number; cell: Cell }[] = []
  cells.forEach((c, i) => {
    const last = out[out.length - 1]
    if (last && last.cell === c) last.to = i + 1
    else out.push({ from: i, to: i + 1, cell: c })
  })
  return out
}

// ── Hourglass (speed of service) ────────────────────────────────────────────

/** A plan's download speed from its name ("200M", "500 Mbps", "1G" → 200, 500, 1000); null when it doesn't say. */
export function planSpeed(plan: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(g|m)/i.exec(plan)
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  return Math.round(n * (m[2].toLowerCase() === "g" ? 1000 : 1))
}

export type Glass = { id: string; name: string; sold: number; unknown: number; link: number | null; busy: number | null; active: number; ratio: number | null; each: number | null }

/** Per deployment: speed sold to its active clients, its links' speed, the busy hour, and what each client gets if all connect at once. */
export function hourglass(sites: Site[], clients: Client[], busy: Map<string, number | null>): Glass[] {
  return sites
    .map((s) => {
      const mine = clients.filter((c) => c.siteId === s.id && clientStatus(c) === "activo")
      let sold = 0
      let unknown = 0
      for (const c of mine)
        for (const x of c.services)
          if (x.type === "internet" && x.status === "activo") {
            const v = planSpeed(x.plan)
            if (v === null) unknown++
            else sold += v
          }
      const link = linkSpeed(s).down
      const name = siteLabel(s)
      return { id: s.id, name, sold, unknown, link, busy: busy.get(name) ?? null, active: mine.length, ratio: link && sold ? sold / link : null, each: link && mine.length ? link / mine.length : null }
    })
    .filter((g) => g.sold > 0 || g.link)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
}

// ── Saturation forecast (the suggestion) ────────────────────────────────────

export type Forecast = { siteId: string; name: string; history: { day: string; use: number }[]; slope: number; level: number; sd: number; eta: number | null; full: boolean }

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * Daily busy-hour use (the fuller direction ÷ the links' speed) for the last 60 whole days (today left out), a least-squares line over the
 * last 42 with traffic, and in how many days that line reaches FULL_SHARE (0 = already there; null = flat or falling,
 * or beyond `horizon`). `sd` is the spread around the line (the band on the chart).
 */
export function saturation(sites: Site[], daily: DailyBusy[], today: string, horizon = 180): Forecast[] {
  const out: Forecast[] = []
  for (const s of sites) {
    const sp = linkSpeed(s)
    const d = daily.find((x) => x.siteId === s.id)
    if (!d || (!sp.down && !sp.up)) continue
    const from = addDay(today, -60)
    const history = d.days
      // Whole days only: today's busiest hour so far would read low and pull the trend down.
      .filter((x) => x.day >= from && x.day < today && (x.down > 0 || x.up > 0))
      .map((x) => ({ day: x.day, use: Math.max(sp.down ? x.down / sp.down : 0, sp.up ? x.up / sp.up : 0) }))
    if (history.length < 7) continue
    const fit = history.filter((x) => x.day >= addDay(today, -42))
    const xs = fit.map((x) => (Date.parse(`${x.day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5)
    const ys = fit.map((x) => x.use)
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
    const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0
    const level = my - slope * mx
    const sd = Math.sqrt(ys.reduce((a, y, i) => a + (y - (level + slope * xs[i])) ** 2, 0) / Math.max(1, ys.length - 2))
    const full = level >= FULL_SHARE
    // (A hair of tolerance: 11.000000001 days is 11.)
    const days = full ? 0 : slope > 0 ? Math.ceil((FULL_SHARE - level) / slope - 1e-6) : null
    out.push({ siteId: s.id, name: siteLabel(s), history, slope, level, sd, eta: days !== null && days <= horizon ? days : null, full })
  }
  return out.sort((a, b) => (a.eta ?? 1e9) - (b.eta ?? 1e9) || b.level - a.level)
}
