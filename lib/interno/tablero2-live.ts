/**
 * La red viva (Tablero 2, owner 2026-11-27: "make it look truly cutting edge"; carriers in the middle, refresh every
 * minute). The network as it is right now: each carrier a hub, a fiber strand per internet link out to its deployment,
 * and each deployment a ring of its towers with the clients online.
 *
 * What the routers' agents report (lib/wispdavor/monitor.ts) is read by the server every minute (tablero2-live-server.ts)
 * into `LiveFigures`; `liveNet` joins it with Despliegues and Clientes:
 * - A link's use is its deployment's traffic now ÷ the deployment's link speed: the agent counts traffic per client,
 *   not per link, so every link of a deployment shows the same share (said in the note).
 * - Online = the client's PPPoE user has a session open on a router of its deployment.
 * - A deployment is "silent" when its newest report is older than three of its report intervals, "outage" while
 *   Monitoreo has a failure open, "full" from FULL_SHARE of its links and "saturated" from SATURATED.
 * - Light: only the problems count (justo / baja / satura, lib/clients/optics.ts); the rest stays calm.
 *
 * `liveLayout` places it all in a square (pure geometry, tested); `demoLive` is the simulated operator's minute.
 */
import { lightStatus } from "../clients/optics"
import type { Client } from "../clients/model"
import { siteLabel, type Site } from "../sites/model"
import { FULL_SHARE } from "../wispdavor/capacity"
import type { OutageKind } from "../wispdavor/monitor"
import { rng, type DemoSet } from "./dashboard-demo"
import { liveOn } from "./tablero2"

// ── What the server sends ───────────────────────────────────────────────────

/** A carrier gateway as the router saw it in its newest report (rtt null = the ping didn't report a time). */
export type LiveGateway = { ip: string; rtt: number | null; loss: number }
export type LiveRouter = { id: string; name: string; siteId: string; lastSeen: string | null; pollMinutes: number; online: number | null; gateways: LiveGateway[]; active: string[] }
export type LiveOutage = { routerId: string; siteId: string; kind: OutageKind; start: string }
/** Each deployment's traffic now: Mbps averaged over its last complete 5-minute buckets (`at` = the newest). */
export type LiveTraffic = { siteId: string; down: number; up: number; at: string }
export type LiveFigures = { now: string; routers: LiveRouter[]; traffic: LiveTraffic[]; outages: LiveOutage[] }

/** The gateways of a stored report (router_metrics.gateways), field by field: loss = pings lost ÷ sent. */
type Gw = { ip?: unknown; sent?: unknown; received?: unknown; rtt?: unknown }
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)

export function readGateways(v: unknown): LiveGateway[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 20).flatMap((g: Gw) => {
    if (typeof g?.ip !== "string") return []
    const sent = n(g.sent) ?? 0
    const received = n(g.received) ?? 0
    const rtt = n(g.rtt)
    return [{ ip: g.ip.slice(0, 45), rtt: rtt === null ? null : Math.round(rtt * 10) / 10, loss: sent > 0 ? Math.max(0, Math.min(1, (sent - received) / sent)) : 0 }]
  })
}

// ── The network now ─────────────────────────────────────────────────────────

/** From here a link is saturated (the full share, FULL_SHARE, is 80 %). */
export const SATURATED = 0.95
/** Traffic older than this isn't "now". */
const STALE_MS = 20 * 60000

export type SiteState = "ok" | "full" | "saturated" | "outage" | "silent" | "nodata"
export type LinkState = "ok" | "lossy" | "down" | "nodata"

export type LiveLink = { id: string; siteId: string; hub: string; carrier: string; down: number | null; gateway: LiveGateway | null; state: LinkState }
export type LiveTower = { id: string; name: string; live: number; online: number | null; justo: number; baja: number; satura: number }
export type LiveSite = {
  id: string
  name: string
  links: LiveLink[]
  /** Mbps of its links (download), null when none says. */
  capacity: number | null
  /** Download Mbps now (null = no recent traffic). */
  use: number | null
  share: number | null
  state: SiteState
  outage: LiveOutage | null
  towers: LiveTower[]
  live: number
  online: number | null
  /** Light problems among its live services. */
  justo: number
  baja: number
  satura: number
  /** Median latency to its carriers now, and the worst loss. */
  rtt: number | null
  loss: number | null
  /** Newest report from its routers (ISO), "" = none. */
  seen: string
}
export type LiveHub = { key: string; name: string; sites: string[]; capacity: number | null; rtt: number | null; loss: number | null; state: LinkState }
export type LiveTotals = { live: number; online: number | null; use: number | null; capacity: number | null; outages: number; full: number; worst: { name: string; rtt: number } | null; seen: string }
export type LiveNet = { hubs: LiveHub[]; sites: LiveSite[]; totals: LiveTotals }

/** The hub a link hangs from: its carrier's name (case and spaces ignored), "" = unnamed, "-" = a deployment with no link. */
export const hubKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ")
export const NO_LINK = "-"

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const net24 = (ip: string) => (/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim()) ? ip.trim().split(".").slice(0, 3).join(".") : "")

/** The link a gateway answers for: the only link, else the one whose public IP shares the gateway's /24, else none. */
function gatewayFor(links: { name: string; ip: string; i: number }[], gws: LiveGateway[]): Map<number, LiveGateway> {
  const out = new Map<number, LiveGateway>()
  if (links.length === 1 && gws.length) {
    // One link: its gateway is the one that answers best (several IPs can be pinged for the same carrier).
    out.set(links[0].i, [...gws].sort((a, b) => a.loss - b.loss || (a.rtt ?? 1e9) - (b.rtt ?? 1e9))[0])
    return out
  }
  for (const l of links) {
    const n = net24(l.ip)
    const g = n ? gws.find((x) => net24(x.ip) === n) : undefined
    if (g) out.set(l.i, g)
  }
  return out
}

const linkState = (g: LiveGateway | null): LinkState => (!g ? "nodata" : g.loss >= 1 ? "down" : g.loss > 0 ? "lossy" : "ok")
const worse = (a: LinkState, b: LinkState): LinkState => (["down", "lossy", "ok", "nodata"].indexOf(a) <= ["down", "lossy", "ok", "nodata"].indexOf(b) ? a : b)

export function liveNet(sites: Site[], clients: Client[], today: string, f: LiveFigures | null): LiveNet {
  const now = f ? Date.parse(f.now) : 0
  const sitesOut: LiveSite[] = []
  for (const s of sites) {
    const routers = f ? f.routers.filter((r) => r.siteId === s.id) : []
    const reporting = routers.filter((r) => r.lastSeen)
    const seen = reporting.map((r) => r.lastSeen as string).sort().pop() ?? ""
    const silent = reporting.length > 0 && reporting.every((r) => now - Date.parse(r.lastSeen as string) > 3 * Math.max(1, r.pollMinutes) * 60000)
    const active = new Set(routers.flatMap((r) => r.active))
    const knowsOnline = reporting.length > 0 && !silent
    const gws = routers.flatMap((r) => r.gateways)

    // Links: every carrier of every room.
    const raw = s.rooms.flatMap((r) => r.carriers).map((c, i) => ({ name: c.name, ip: c.ip, down: c.downMbps, i }))
    const byLink = gatewayFor(raw, gws)
    const links: LiveLink[] = raw.map((c) => {
      const g = byLink.get(c.i) ?? null
      return { id: `${s.id}:${c.i}`, siteId: s.id, hub: hubKey(c.name), carrier: c.name.trim(), down: c.down, gateway: g, state: linkState(g) }
    })
    const speeds = links.map((l) => l.down).filter((v): v is number => v !== null && v > 0)
    const capacity = speeds.length ? speeds.reduce((a, b) => a + b, 0) : null

    // Towers and clients (one tower: everyone is in it; several: the client's own, else "Sin torre").
    const towers = new Map<string, LiveTower>(s.towers.map((t) => [t.id, { id: t.id, name: t.name, live: 0, online: knowsOnline ? 0 : null, justo: 0, baja: 0, satura: 0 }]))
    const none: LiveTower = { id: "", name: "", live: 0, online: knowsOnline ? 0 : null, justo: 0, baja: 0, satura: 0 }
    for (const c of clients) {
      if (c.siteId !== s.id) continue
      const net = c.services.filter((x) => x.type === "internet" && liveOn(x, today))
      if (!net.length) continue
      const tower = s.towers.length === 1 ? towers.get(s.towers[0].id)! : (towers.get(c.towerId) ?? none)
      tower.live++
      if (tower.online !== null && net.some((x) => x.status !== "suspendido" && x.pppoeUser && active.has(x.pppoeUser))) tower.online++
      for (const x of net) {
        const ls = lightStatus(x.rxDbm)
        if (ls === "justo" || ls === "baja" || ls === "satura") tower[ls]++
      }
    }
    const ts = [...towers.values(), ...(none.live ? [none] : [])].filter((t) => t.live > 0 || s.towers.length <= 1)
    const sum = (k: "live" | "justo" | "baja" | "satura") => ts.reduce((a, t) => a + t[k], 0)

    const tr = f?.traffic.find((x) => x.siteId === s.id && now - Date.parse(x.at) <= STALE_MS)
    const use = tr ? tr.down : null
    const share = use !== null && capacity ? use / capacity : null
    const outage = f?.outages.find((o) => o.siteId === s.id) ?? null
    const state: SiteState = outage ? "outage" : silent ? "silent" : !reporting.length ? "nodata" : share !== null && share >= SATURATED ? "saturated" : share !== null && share >= FULL_SHARE ? "full" : "ok"
    const rtts = gws.map((g) => g.rtt).filter((v): v is number => v !== null)
    sitesOut.push({
      id: s.id,
      name: siteLabel(s),
      links,
      capacity,
      use,
      share,
      state,
      outage,
      towers: ts,
      live: sum("live"),
      online: knowsOnline ? ts.reduce((a, t) => a + (t.online ?? 0), 0) : null,
      justo: sum("justo"),
      baja: sum("baja"),
      satura: sum("satura"),
      rtt: median(rtts),
      loss: gws.length ? Math.max(...gws.map((g) => g.loss)) : null,
      seen,
    })
  }
  // Busiest first: they get the room on the ring.
  sitesOut.sort((a, b) => b.live - a.live || (b.capacity ?? 0) - (a.capacity ?? 0) || a.name.localeCompare(b.name, "es"))

  // Hubs: each carrier (by name) with the deployments it reaches; deployments without a link hang from NO_LINK.
  const hubs = new Map<string, LiveHub>()
  const add = (key: string, name: string, site: LiveSite, l: LiveLink | null) => {
    const h = hubs.get(key) ?? { key, name, sites: [], capacity: null, rtt: null, loss: null, state: "nodata" as LinkState }
    if (!h.sites.includes(site.id)) h.sites.push(site.id)
    if (l) {
      if (l.down) h.capacity = (h.capacity ?? 0) + l.down
      if (l.gateway) {
        h.rtt = l.gateway.rtt === null ? h.rtt : Math.max(h.rtt ?? 0, l.gateway.rtt)
        h.loss = Math.max(h.loss ?? 0, l.gateway.loss)
      }
      h.state = worse(h.state, l.state)
    }
    hubs.set(key, h)
  }
  for (const s of sitesOut) {
    if (!s.links.length) add(NO_LINK, "", s, null)
    for (const l of s.links) add(l.hub, l.carrier, s, l)
  }
  const hubList = [...hubs.values()].sort((a, b) => (a.key === NO_LINK ? 1 : b.key === NO_LINK ? -1 : 0) || b.sites.length - a.sites.length || (b.capacity ?? 0) - (a.capacity ?? 0) || a.name.localeCompare(b.name, "es"))

  const known = sitesOut.filter((s) => s.online !== null)
  const used = sitesOut.filter((s) => s.use !== null)
  const caps = used.map((s) => s.capacity).filter((v): v is number => v !== null)
  const worst = sitesOut.filter((s) => s.rtt !== null).sort((a, b) => (b.rtt as number) - (a.rtt as number))[0]
  return {
    hubs: hubList,
    sites: sitesOut,
    totals: {
      live: sitesOut.reduce((a, s) => a + s.live, 0),
      online: known.length ? known.reduce((a, s) => a + (s.online ?? 0), 0) : null,
      use: used.length ? used.reduce((a, s) => a + (s.use ?? 0), 0) : null,
      capacity: caps.length ? caps.reduce((a, b) => a + b, 0) : null,
      outages: sitesOut.filter((s) => s.state === "outage" || s.state === "silent").length,
      full: sitesOut.filter((s) => s.state === "full" || s.state === "saturated").length,
      worst: worst ? { name: worst.name, rtt: worst.rtt as number } : null,
      seen: sitesOut.map((s) => s.seen).filter(Boolean).sort().pop() ?? "",
    },
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

export type Pt = { x: number; y: number }
export type HubSpot = Pt & { key: string; r: number; angle: number }
export type SiteSpot = Pt & { id: string; r: number; angle: number }
export type Strand = { id: string; hub: string; siteId: string; d: string; width: number; length: number }
export type LiveLayout = { size: number; c: number; hubs: HubSpot[]; sites: SiteSpot[]; strands: Strand[]; rings: number[] }

const polar = (c: number, r: number, a: number): Pt => ({ x: c + r * Math.cos(a), y: c + r * Math.sin(a) })
const round = (n: number) => Math.round(n * 10) / 10

/** A strand's width: the link's speed (a 1 Gbps link ~ 6 px), a hairline when unknown. */
export const strandWidth = (mbps: number | null, scale = 1) => (mbps ? Math.max(1.5, Math.min(9, 1.4 + 4.6 * Math.sqrt(mbps / 1000))) : 1.2) * scale

/**
 * The square: the hubs on a small inner circle (one hub sits in the middle), the deployments on the outer circle in the
 * order of their main hub (so strands rarely cross) and each strand a curve from its hub out to the deployment's ring.
 * A deployment's ring grows with its clients; two links between the same pair fan out a little.
 */
export function liveLayout(net: LiveNet, size: number): LiveLayout {
  const c = size / 2
  const k = size / 600
  const nodeR = (live: number) => Math.max(15, Math.min(44, 13 + 4.2 * Math.sqrt(live))) * Math.max(0.6, k)
  // Main hub of each deployment: its fastest link's.
  const main = (s: LiveSite) => (s.links.length ? [...s.links].sort((a, b) => (b.down ?? 0) - (a.down ?? 0))[0].hub : NO_LINK)
  const order = net.hubs.map((h) => h.key)
  const sites = [...net.sites].sort((a, b) => order.indexOf(main(a)) - order.indexOf(main(b)))
  const radii = sites.map((s) => nodeR(s.live))
  const label = 34 * Math.max(0.75, k)
  const outer = c - Math.max(0, ...radii) - label
  // Angles: each deployment's share of the circle follows its size, starting at the top.
  const weights = radii.map((r) => r + 10 * k)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let a = -Math.PI / 2
  const siteSpots: SiteSpot[] = sites.map((s, i) => {
    const step = (weights[i] / total) * Math.PI * 2
    const angle = a + step / 2
    a += step
    return { id: s.id, r: round(radii[i]), angle, ...pt(polar(c, outer, angle)) }
  })
  // Hubs: each placed toward the deployments it feeds (mean direction), on a small circle; one hub in the middle.
  const inner = net.hubs.length > 1 ? Math.min(outer * 0.34, 95 * Math.max(0.7, k)) : 0
  const hubR = Math.max(16, 22 * k)
  const hubSpots: HubSpot[] = net.hubs.map((h, i) => {
    const mine = siteSpots.filter((s) => h.sites.includes(s.id))
    const vx = mine.reduce((acc, s) => acc + Math.cos(s.angle), 0)
    const vy = mine.reduce((acc, s) => acc + Math.sin(s.angle), 0)
    const angle = Math.hypot(vx, vy) > 0.2 ? Math.atan2(vy, vx) : -Math.PI / 2 + (i / Math.max(1, net.hubs.length)) * Math.PI * 2
    return { key: h.key, r: round(hubR), angle, ...pt(polar(c, inner, angle)) }
  })
  spread(hubSpots, c, inner, hubR * 2.6)

  const strands: Strand[] = []
  for (const s of net.sites) {
    const sp = siteSpots.find((x) => x.id === s.id)!
    const groups = new Map<string, LiveLink[]>()
    for (const l of s.links) groups.set(l.hub, [...(groups.get(l.hub) ?? []), l])
    if (!s.links.length) groups.set(NO_LINK, [])
    for (const [hub, ls] of groups) {
      const hp = hubSpots.find((h) => h.key === hub)!
      const list = ls.length ? ls : [null]
      list.forEach((l, j) => {
        const fan = (j - (list.length - 1) / 2) * 0.09
        const d = curve(c, hp, sp, fan)
        strands.push({ id: l ? l.id : `${s.id}:none`, hub, siteId: s.id, d: d.path, width: round(strandWidth(l?.down ?? null, Math.max(0.7, k))), length: Math.round(d.length) })
      })
    }
  }
  const rings = [inner, (inner + outer) / 2, outer].filter((r) => r > 0).map(round)
  return { size, c, hubs: hubSpots, sites: siteSpots, strands, rings }
}

const pt = (p: Pt): Pt => ({ x: round(p.x), y: round(p.y) })

/** Pushes hubs apart along their circle until none overlaps (a few passes are plenty for a handful). */
function spread(hubs: HubSpot[], c: number, r: number, min: number) {
  if (hubs.length < 2 || r === 0) return
  const minA = Math.min(Math.PI * 2 / hubs.length, 2 * Math.asin(Math.min(1, min / (2 * r))))
  for (let pass = 0; pass < 40; pass++) {
    hubs.sort((x, y) => x.angle - y.angle)
    let moved = false
    for (let i = 0; i < hubs.length; i++) {
      const next = hubs[(i + 1) % hubs.length]
      let gap = next.angle - hubs[i].angle
      if (i === hubs.length - 1) gap += Math.PI * 2
      if (gap < minA - 1e-6) {
        const push = (minA - gap) / 2
        hubs[i].angle -= push
        next.angle += push
        moved = true
      }
    }
    if (!moved) break
  }
  for (const h of hubs) Object.assign(h, pt(polar(c, r, h.angle)))
}

/** A curve from a hub to a deployment's ring edge, bowed toward the outside; `fan` (radians) splits parallel links. */
function curve(c: number, h: HubSpot, s: SiteSpot, fan: number): { path: string; length: number } {
  const end = polar(c, Math.hypot(s.x - c, s.y - c) - s.r - 2, s.angle + fan * 0.25)
  const startR = h.r + 2
  const dir = Math.atan2(end.y - h.y, end.x - h.x) + fan
  const start = { x: h.x + startR * Math.cos(dir), y: h.y + startR * Math.sin(dir) }
  const mid = (Math.hypot(start.x - c, start.y - c) + Math.hypot(end.x - c, end.y - c)) / 2
  const c1 = polar(c, mid, s.angle + fan)
  const c2 = polar(c, mid * 1.02 + (Math.hypot(end.x - c, end.y - c) - mid) * 0.4, s.angle + fan * 0.5)
  // Rough length (chord sum of the control polygon and the chord, halved): only paces the moving light.
  const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)
  const length = (dist(start, c1) + dist(c1, c2) + dist(c2, end) + dist(start, end)) / 2
  const f = (p: Pt) => `${round(p.x)},${round(p.y)}`
  return { path: `M${f(start)} C${f(c1)} ${f(c2)} ${f(end)}`, length }
}

// ── The simulated operator's minute ─────────────────────────────────────────

const mxHour = (t: number) => Number(new Date(t).toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }))
/** Each demo deployment's busy-hour share of its links: the third runs hot in the evening. */
const PEAK = [0.62, 0.48, 0.9, 0.55, 0.4]
/** Carrier latency floor per demo deployment (ms). */
const RTT = [3.2, 4.1, 6.5, 9.8, 12.4]

/**
 * The simulated network at `now` (labelled SIMULACIÓN): one router per demo deployment reporting a minute or two ago,
 * a gateway per link (one losing a few pings), traffic following the hour of the day with a little noise each minute,
 * and about nine in ten clients online. Seeded by the minute, so each refresh moves a little.
 */
export function demoLive(set: Pick<DemoSet, "sites" | "clients">, now: number): LiveFigures {
  const minute = Math.floor(now / 60000)
  const r = rng(20261127 + (minute % 100000))
  const hr = mxHour(now)
  const curve = hr >= 19 && hr <= 23 ? 1 : hr >= 9 && hr <= 18 ? 0.62 : hr >= 6 && hr <= 8 ? 0.4 : 0.18
  const routers: LiveRouter[] = []
  const traffic: LiveTraffic[] = []
  set.sites.forEach((s, si) => {
    const links = s.rooms.flatMap((x) => x.carriers)
    const active = set.clients
      .filter((c) => c.siteId === s.id)
      .flatMap((c) => c.services)
      .filter((x) => x.type === "internet" && x.status === "activo" && x.pppoeUser && r() < 0.91)
      .map((x) => x.pppoeUser)
    routers.push({
      id: `demo-router-${si}`,
      name: `Router ${s.name}`,
      siteId: s.id,
      lastSeen: new Date(now - (40 + Math.floor(r() * 80)) * 1000).toISOString(),
      pollMinutes: 2,
      online: active.length,
      gateways: links.map((c, li) => ({ ip: c.ip.replace(/\.\d+$/, ".1"), rtt: Math.round((RTT[si % RTT.length] * (curve > 0.9 ? 1.4 : 1) + r() * 1.6) * 10) / 10, loss: si === 3 && li === 0 ? 0.02 : 0 })),
      active,
    })
    const cap = links.reduce((a, c) => a + (c.downMbps ?? 0), 0)
    const share = Math.min(0.99, PEAK[si % PEAK.length] * curve * (0.93 + r() * 0.12))
    traffic.push({ siteId: s.id, down: Math.round(cap * share * 10) / 10, up: Math.round(cap * share * 0.22 * 10) / 10, at: new Date(now - 4 * 60000).toISOString() })
  })
  return { now: new Date(now).toISOString(), routers, traffic, outages: [] }
}
