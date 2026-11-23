/**
 * Tablero 2's carrier and continuity figures from the database (rules and shapes in tablero2-net.ts): gateway pings
 * per hour (7 days), each router's reported hours and outages (30 days; reports are kept 14 days, outages longer),
 * ONT and gateway latency (24 hours) and each deployment's busy hour per day (90 days). Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import type { OutageKind } from "../wispdavor/monitor"
import type { CarrierFigures, DailyBusy, GatewaySeries, PathStat, RouterContinuity, SiteTraffic } from "./tablero2-net"

export async function carrierFigures(): Promise<CarrierFigures> {
  const pool = getPool()
  const routers = (await pool.query(`select id, name, site_id from routers order by name`)).rows as { id: string; name: string; site_id: string }[]
  const byId = new Map(routers.map((r) => [r.id, r]))

  // Pulse: each gateway's pings summed per hour (latency only where flood-ping reported it).
  const g = (
    await pool.query(
      `select m.router_id, x->>'ip' as ip, date_trunc('hour', m.bucket) as h,
              percentile_cont(0.5) within group (order by (x->>'rtt')::float8) as p50,
              percentile_cont(0.95) within group (order by (x->>'rtt')::float8) as p95,
              sum((x->>'sent')::int)::int as sent, sum((x->>'received')::int)::int as received
         from router_metrics m, jsonb_array_elements(m.gateways) x
        where m.bucket > now() - interval '7 days'
        group by 1, 2, 3 order by 3`
    )
  ).rows as { router_id: string; ip: string; h: Date; p50: number | null; p95: number | null; sent: number; received: number }[]
  const gw = new Map<string, GatewaySeries>()
  for (const r of g) {
    const ro = byId.get(r.router_id)
    if (!ro) continue
    const key = `${r.router_id}|${r.ip}`
    const s = gw.get(key) ?? { routerId: r.router_id, router: ro.name, siteId: ro.site_id, ip: r.ip, hours: [] }
    s.hours.push({ t: r.h.toISOString(), rtt: r.p50 === null ? null : Math.round(r.p50 * 10) / 10, p95: r.p95 === null ? null : Math.round(r.p95 * 10) / 10, loss: r.sent ? Math.max(0, (r.sent - r.received) / r.sent) : 0 })
    gw.set(key, s)
  }

  // Continuity: hours with a report (and whether a gateway lost pings), and the outages of the last 30 days.
  const hrs = (
    await pool.query(
      `select m.router_id, date_trunc('hour', m.bucket) as h,
              bool_or(exists (select 1 from jsonb_array_elements(m.gateways) x where (x->>'received')::int < (x->>'sent')::int)) as lossy
         from router_metrics m where m.bucket > now() - interval '30 days' group by 1, 2`
    )
  ).rows as { router_id: string; h: Date; lossy: boolean }[]
  const outs = (await pool.query(`select router_id, kind, started_at, ended_at from outages where ended_at is null or ended_at > now() - interval '30 days' order by started_at`)).rows as { router_id: string; kind: OutageKind; started_at: Date; ended_at: Date | null }[]
  const continuity: RouterContinuity[] = routers.map((r) => ({
    routerId: r.id,
    router: r.name,
    siteId: r.site_id,
    hours: hrs.filter((x) => x.router_id === r.id).map((x) => ({ t: x.h.toISOString(), lossy: x.lossy })),
    outages: outs.filter((o) => o.router_id === r.id).map((o) => ({ kind: o.kind, start: o.started_at.toISOString(), end: o.ended_at?.toISOString() ?? "" })),
  }))

  // Packet path: last day's gateway latency and the ONTs pinged in the last day.
  const pg = (await pool.query(`select m.router_id, percentile_cont(0.5) within group (order by (x->>'rtt')::float8) as rtt from router_metrics m, jsonb_array_elements(m.gateways) x where m.bucket > now() - interval '24 hours' group by 1`)).rows as { router_id: string; rtt: number | null }[]
  const po = (
    await pool.query(
      `select router_id, percentile_cont(0.5) within group (order by ont_rtt) as p50, percentile_cont(0.9) within group (order by ont_rtt) as p90,
              count(*)::int as n, count(*) filter (where ont_loss > 0)::int as lossy
         from router_users where ont_at > now() - interval '24 hours' group by 1`
    )
  ).rows as { router_id: string; p50: number | null; p90: number | null; n: number; lossy: number }[]
  const path: PathStat[] = routers.map((r) => {
    const a = pg.find((x) => x.router_id === r.id)
    const b = po.find((x) => x.router_id === r.id)
    return { routerId: r.id, siteId: r.site_id, gatewayRtt: a?.rtt ?? null, ontRtt: b?.p50 ?? null, ontP90: b?.p90 ?? null, onts: b?.n ?? 0, ontLossy: b?.lossy ?? 0 }
  })

  // Saturation: each deployment's busiest hour per day (Mexico City days), 5-minute table for the last week, hourly before.
  const d = (
    await pool.query(
      `with h as (
         select r.site_id, date_trunc('hour', t.bucket) as hour, sum(t.down)::float8 as down, sum(t.up)::float8 as up
           from traffic_5m t join routers r on r.id = t.router_id
          where t.bucket > now() - interval '7 days' and t.bucket < date_trunc('hour', now()) and r.site_id <> '' group by 1, 2
         union all
         select r.site_id, t.hour, sum(t.down)::float8, sum(t.up)::float8
           from traffic_hourly t join routers r on r.id = t.router_id
          where t.hour > now() - interval '90 days' and t.hour <= now() - interval '7 days' and r.site_id <> '' group by 1, 2
       )
       select site_id, to_char(hour at time zone 'America/Mexico_City', 'YYYY-MM-DD') as day, max(down * 8 / 3600 / 1e6) as down, max(up * 8 / 3600 / 1e6) as up
         from h group by 1, 2 order by 2`
    )
  ).rows as { site_id: string; day: string; down: number; up: number }[]
  const daily = new Map<string, DailyBusy>()
  for (const r of d) {
    const x = daily.get(r.site_id) ?? { siteId: r.site_id, days: [] }
    x.days.push({ day: r.day, down: Math.round(r.down * 10) / 10, up: Math.round(r.up * 10) / 10 })
    daily.set(r.site_id, x)
  }

  // Horizon: each deployment's traffic hour by hour, last 7 days (the hour still running left out).
  const th = (
    await pool.query(
      `select r.site_id, date_trunc('hour', t.bucket) as h, (sum(t.down)::float8 * 8 / 3600 / 1e6) as down, (sum(t.up)::float8 * 8 / 3600 / 1e6) as up
         from traffic_5m t join routers r on r.id = t.router_id
        where t.bucket > now() - interval '7 days' and t.bucket < date_trunc('hour', now()) and r.site_id <> ''
        group by 1, 2 order by 2`
    )
  ).rows as { site_id: string; h: Date; down: number; up: number }[]
  const traffic = new Map<string, SiteTraffic>()
  for (const r of th) {
    const x = traffic.get(r.site_id) ?? { siteId: r.site_id, hours: [] }
    x.hours.push({ t: r.h.toISOString(), down: Math.round(r.down * 10) / 10, up: Math.round(r.up * 10) / 10 })
    traffic.set(r.site_id, x)
  }

  return { now: new Date().toISOString(), gateways: [...gw.values()], continuity: continuity.filter((c) => c.hours.length || c.outages.length), path: path.filter((p) => p.gatewayRtt !== null || p.onts), daily: [...daily.values()], traffic: [...traffic.values()] }
}
