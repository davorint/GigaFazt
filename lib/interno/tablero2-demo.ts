/**
 * The simulated operator's carriers and continuity for Tablero 2 (shown only with "Datos simulados", labelled
 * SIMULACIÓN): one router per demo deployment, a gateway per link answering in a few milliseconds (more in the evening),
 * a handful of lossy hours, three outages in the month, ONT pings and 90 days of busy hours growing with the clients.
 * Its own random sequence, so the rest of the simulated data stays as it was.
 */
import { linkSpeed } from "../wispdavor/capacity"
import type { Site } from "../sites/model"
import { rng, type DemoSet } from "./dashboard-demo"
import type { CarrierFigures, GatewaySeries, OutageSpan, RouterContinuity } from "./tablero2-net"

const HOUR = 3600000
const BASE = [3.2, 4.1, 6.5, 9.8, 12.4]
/** Hours ago each outage started, how long it lasted (minutes), what it was. */
const OUTAGES: Record<number, [number, number, OutageSpan["kind"]][]> = { 0: [[17 * 24 + 5, 25, "sesiones"]], 2: [[9 * 24 + 2, 160, "carrier"]], 4: [[3 * 24 + 7, 50, "router"], [22 * 24 + 1, 35, "carrier"]] }
/** Busy-hour growth over the 90 days (share of today's), per deployment: the second grows fast. */
const GROWTH = [0.82, 0.55, 0.7, 0.9, 0.95]

const mxHour = (t: number) => Number(new Date(t).toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }))

export function demoCarriers(set: Pick<DemoSet, "sites" | "network" | "clients">, now: number): CarrierFigures {
  const r = rng(20261124)
  const end = Math.floor(now / HOUR) * HOUR
  const gateways: GatewaySeries[] = []
  const continuity: RouterContinuity[] = []
  set.sites.forEach((s: Site, si) => {
    const routerId = `demo-router-${si}`
    const router = `Router ${s.name}`
    const outages = (OUTAGES[si] ?? []).map(([ago, min, kind]) => ({ kind, start: new Date(end - ago * HOUR + 12 * 60000).toISOString(), end: new Date(end - ago * HOUR + (12 + min) * 60000).toISOString() }))
    const inOutage = (t: number) => outages.some((o) => Date.parse(o.start) < t + HOUR && Date.parse(o.end) > t && o.kind !== "sesiones")
    const lossyHours = new Set<number>()
    s.rooms
      .flatMap((x) => x.carriers)
      .forEach((c, li) => {
        const hours = []
        for (let h = 7 * 24; h >= 1; h--) {
          const t = end - h * HOUR
          const hr = mxHour(t)
          const evening = hr >= 19 && hr <= 23 ? 1.35 + r() * 0.25 : hr >= 9 && hr <= 18 ? 1.1 : 1
          const down = inOutage(t)
          const lossy = !down && r() < 0.015
          if (lossy) lossyHours.add(t)
          const p50 = (BASE[si] ?? 5) + li * 2.5
          const rtt = Math.round(p50 * evening * (0.9 + r() * 0.2) * 10) / 10
          hours.push({ t: new Date(t).toISOString(), rtt: down ? null : rtt, p95: down ? null : Math.round(rtt * (1.5 + r() * 0.9 + (lossy ? 1.5 : 0)) * 10) / 10, loss: down ? 1 : lossy ? Math.round((0.005 + r() * 0.04) * 1000) / 1000 : 0 })
        }
        gateways.push({ routerId, router, siteId: s.id, ip: `189.${200 + si}.${li}.1`, hours })
      })
    const hours = []
    for (let h = 30 * 24; h >= 1; h--) {
      const t = end - h * HOUR
      hours.push({ t: new Date(t).toISOString(), lossy: lossyHours.has(t) || (h > 7 * 24 && r() < 0.008) })
    }
    continuity.push({ routerId, router, siteId: s.id, hours, outages })
  })
  const path = set.sites.map((s, si) => ({ routerId: `demo-router-${si}`, siteId: s.id, gatewayRtt: Math.round((BASE[si] ?? 5) * 1.15 * 10) / 10, ontRtt: Math.round((0.55 + r() * 0.6) * 100) / 100, ontP90: Math.round((1.8 + r() * 2.6) * 10) / 10, onts: set.clients.filter((c) => c.siteId === s.id && c.services.some((x) => x.status === "activo")).length, ontLossy: Math.floor(r() * 4) }))
  const today = new Date(now).toISOString().slice(0, 10)
  const daily = set.sites.map((s, si) => {
    const sp = linkSpeed(s).down ?? 0
    const target = (set.network.sites[si]?.use ?? 0.5) * sp
    const days = []
    for (let k = 89; k >= 0; k--) {
      const day = new Date(Date.parse(`${today}T12:00:00Z`) - k * 864e5)
      const t = 1 - k / 89
      const weekend = [0, 6].includes(day.getUTCDay()) ? 1.07 : 1
      const down = Math.round(target * (GROWTH[si] + (1 - GROWTH[si]) * t) * weekend * (0.93 + r() * 0.1) * 10) / 10
      days.push({ day: day.toISOString().slice(0, 10), down, up: Math.round(down * 0.18 * 10) / 10 })
    }
    return { siteId: s.id, days }
  })
  return { now: new Date(now).toISOString(), gateways, continuity, path, daily }
}
