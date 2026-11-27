/**
 * La red viva's minute from the database (shapes and rules in tablero2-live.ts): every router with its newest report
 * (sessions online, carrier gateways), the PPPoE users with a session open, each deployment's traffic over its last
 * complete 5-minute buckets and the failures still open. Small queries on indexed recent rows: it runs every minute
 * while the page is open. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import type { OutageKind } from "../wispdavor/monitor"
import { readGateways, type LiveFigures } from "./tablero2-live"

export async function liveFigures(): Promise<LiveFigures> {
  const pool = getPool()
  const [routers, metrics, users, traffic, outages] = await Promise.all([
    pool.query(`select id, name, site_id, last_seen_at, poll_minutes from routers order by name`),
    pool.query(`select distinct on (router_id) router_id, online, gateways from router_metrics where bucket > now() - interval '1 hour' order by router_id, bucket desc`),
    pool.query(`select router_id, "user" from router_users where active`),
    // Complete buckets only (the one still filling would read low): the last 20 minutes, before the current 5.
    pool.query(
      `with b as (
         select r.site_id, t.bucket, sum(t.down)::float8 as down, sum(t.up)::float8 as up
           from traffic_5m t join routers r on r.id = t.router_id
          where t.bucket > now() - interval '25 minutes' and t.bucket < now() - interval '5 minutes' and r.site_id <> ''
          group by 1, 2
       )
       select site_id, avg(down) * 8 / 300 / 1e6 as down, avg(up) * 8 / 300 / 1e6 as up, max(bucket) as at from b group by 1`
    ),
    pool.query(`select router_id, site_id, kind, started_at from outages where ended_at is null order by started_at`),
  ])
  const m = new Map((metrics.rows as { router_id: string; online: number | null; gateways: unknown }[]).map((r) => [r.router_id, r]))
  const act = new Map<string, string[]>()
  for (const u of users.rows as { router_id: string; user: string }[]) act.set(u.router_id, [...(act.get(u.router_id) ?? []), u.user])
  return {
    now: new Date().toISOString(),
    routers: (routers.rows as { id: string; name: string; site_id: string; last_seen_at: Date | null; poll_minutes: number }[]).map((r) => ({
      id: r.id,
      name: r.name,
      siteId: r.site_id,
      lastSeen: r.last_seen_at?.toISOString() ?? null,
      pollMinutes: r.poll_minutes,
      online: m.get(r.id)?.online ?? null,
      gateways: readGateways(m.get(r.id)?.gateways),
      active: act.get(r.id) ?? [],
    })),
    traffic: (traffic.rows as { site_id: string; down: number; up: number; at: Date }[]).map((t) => ({ siteId: t.site_id, down: Math.round(t.down * 10) / 10, up: Math.round(t.up * 10) / 10, at: t.at.toISOString() })),
    outages: (outages.rows as { router_id: string; site_id: string; kind: OutageKind; started_at: Date }[]).map((o) => ({ routerId: o.router_id, siteId: o.site_id, kind: o.kind, start: o.started_at.toISOString() })),
  }
}
