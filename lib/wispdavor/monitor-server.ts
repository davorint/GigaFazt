/**
 * Monitoring on the server (WispDavor phase 4): what each router's visit adds (sessions online and carrier pings per
 * 5-minute bucket, the ONT pings), outages opened and ended (team alert), routers that went silent, and what the staff
 * page and the client portal read. Rules in lib/wispdavor/monitor.ts.
 */
import "server-only"
import { getPool } from "../db/client"
import { sendText } from "../reports/notify"
import { SITE_URL } from "../site"
import { loss, outageStep, type GatewayPing, type OntPing, type OpenOutage, type OutageKind } from "./monitor"

type RouterRef = { id: string; name: string; siteId: string }

const LINK = `${SITE_URL}/interno/software/wispdavor/monitoreo`
const KIND_TEXT: Record<OutageKind, string> = {
  sesiones: "se cayeron las sesiones PPPoE",
  carrier: "ningún carrier responde",
  router: "el router dejó de reportarse",
}
const mx = (d: Date) => d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })
const minutes = (from: Date, to: Date) => Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000))

/** What a visit adds: the bucket's sessions online and gateway pings, the ONTs pinged, and the outage step. */
export async function recordHealth(r: RouterRef, bucket: Date, online: number | null, gateways: GatewayPing[], onts: OntPing[]) {
  const pool = getPool()
  // The most online in the half hour before this visit (the peak a sudden drop is measured against).
  const peak = Number(((await pool.query(`select coalesce(max(online), 0) as m from router_metrics where router_id = $1 and bucket >= $2::timestamptz - interval '30 minutes' and bucket < $2`, [r.id, bucket])).rows[0] as { m: number }).m)
  await pool.query(
    `insert into router_metrics (router_id, bucket, online, gateways) values ($1, $2, $3, $4::jsonb)
     on conflict (router_id, bucket) do update set online = coalesce(excluded.online, router_metrics.online), gateways = case when jsonb_array_length(excluded.gateways) > 0 then excluded.gateways else router_metrics.gateways end`,
    [r.id, bucket, online, JSON.stringify(gateways.map((g) => ({ ip: g.ip, sent: g.sent, received: g.received, rtt: g.rtt })))]
  )
  if (onts.length)
    await pool.query(
      `update router_users u set ont_rtt = x.rtt, ont_loss = x.loss, ont_at = now()
         from unnest($2::text[], $3::float8[], $4::float8[]) as x(u, rtt, loss)
       where u.router_id = $1 and u."user" = x.u`,
      [r.id, onts.map((o) => o.user), onts.map((o) => o.rtt), onts.map((o) => loss(o))]
    )
  const open = (await pool.query(`select id, kind, baseline, low, started_at from outages where router_id = $1 and ended_at is null order by id desc limit 1`, [r.id])).rows[0] as
    | { id: string; kind: OutageKind; baseline: number; low: number; started_at: Date }
    | undefined
  const step = outageStep(open ? ({ kind: open.kind, baseline: open.baseline, low: open.low } satisfies OpenOutage) : null, online, peak, gateways)
  if (!step) return
  if (step.action === "low" && open) {
    await pool.query(`update outages set low = $2 where id = $1`, [open.id, step.low])
    return
  }
  if (step.action === "close" && open) {
    const ended = (await pool.query(`update outages set ended_at = now() where id = $1 and ended_at is null returning ended_at`, [open.id])).rows[0] as { ended_at: Date } | undefined
    if (ended) await sendText("caida", `✅ Se restableció ${r.name}: ${KIND_TEXT[open.kind]} (${minutes(open.started_at, ended.ended_at)} min)\n${LINK}`).catch(() => undefined)
    return
  }
  if (step.action === "open") {
    const detail = step.kind === "carrier" ? gateways.map((g) => g.ip).join(", ") : step.kind === "sesiones" ? `${step.low} de ${step.baseline} en línea` : ""
    const made = await pool.query(
      `insert into outages (router_id, site_id, kind, baseline, low, detail) select $1, $2, $3, $4, $5, $6 where not exists (select 1 from outages where router_id = $1 and ended_at is null)`,
      [r.id, r.siteId, step.kind, step.baseline, step.low, detail]
    )
    if ((made.rowCount ?? 0) > 0) await sendText("caida", `🚨 Falla en ${r.name}: ${KIND_TEXT[step.kind]}${detail ? ` (${detail})` : ""} · ${mx(new Date())}\n${LINK}`).catch(() => undefined)
  }
}

/**
 * Routers that stopped reporting: silent for 3 of their intervals (lib/wispdavor/routers.ts silentMinutes) after
 * reporting within the last day open a "router" outage (its next visit ends it). Runs on every router's visit and from
 * /api/interno/vigia (an outside pinger every 5 minutes, so a single router going silent is noticed too).
 */
export async function sweepSilent(): Promise<number> {
  const pool = getPool()
  let opened = 0
  const quiet = (await pool.query(
    `select r.id, r.name, r.site_id from routers r
      where r.last_seen_at < now() - make_interval(mins => 3 * r.poll_script) and r.last_seen_at > now() - interval '1 day'
        and not exists (select 1 from outages o where o.router_id = r.id and o.ended_at is null)`
  )).rows as { id: string; name: string; site_id: string }[]
  for (const q of quiet) {
    const made = await pool.query(
      `insert into outages (router_id, site_id, kind) select $1, $2, 'router' where not exists (select 1 from outages where router_id = $1 and ended_at is null)`,
      [q.id, q.site_id]
    )
    if ((made.rowCount ?? 0) > 0) {
      opened++
      await sendText("caida", `🚨 ${q.name}: ${KIND_TEXT.router} · ${mx(new Date())}\n${LINK}`).catch(() => undefined)
    }
  }
  return opened
}

/** The open outage of a deployment, for its clients' portal (null = none). */
export async function siteOutage(siteId: string): Promise<{ since: string } | null> {
  if (!siteId) return null
  const row = (await getPool().query(`select o.started_at from outages o join routers r on r.id = o.router_id where o.site_id = $1 and o.ended_at is null order by o.started_at limit 1`, [siteId])).rows[0] as { started_at: Date } | undefined
  return row ? { since: row.started_at.toISOString() } : null
}

/** Lines for the daily summary: outages still open. */
export async function outageDigest(): Promise<string[]> {
  // A silent router is already in the routers' lines of the summary (routerDigest): not listed twice.
  const rows = (await getPool().query(`select r.name, o.kind, o.started_at from outages o join routers r on r.id = o.router_id where o.ended_at is null and o.kind <> 'router' order by o.started_at`)).rows as { name: string; kind: OutageKind; started_at: Date }[]
  if (!rows.length) return []
  return [`🚨 Fallas abiertas: ${rows.length}`, ...rows.slice(0, 10).map((x) => `• ${x.name}: ${KIND_TEXT[x.kind]} desde ${mx(x.started_at)}`)]
}

export type MonitorView = {
  routers: { id: string; name: string; siteId: string; lastSeenAt: string; online: number; users: number }[]
  series: Record<string, { t: string; online: number | null; gateways: { ip: string; sent: number; received: number; rtt: number | null }[] }[]>
  onts: { routerId: string; user: string; rtt: number | null; loss: number | null; at: string }[]
  outages: { id: string; routerId: string; kind: OutageKind; startedAt: string; endedAt: string; baseline: number; low: number; detail: string }[]
}

/** The staff page: routers with their last day of buckets, the ONTs worth a look, and the outages of the last 30 days. */
export async function monitorView(): Promise<MonitorView> {
  const pool = getPool()
  const routers = (await pool.query(
    `select r.id, r.name, r.site_id, r.last_seen_at,
            (select count(*) from router_users u where u.router_id = r.id and u.active) as online,
            (select count(*) from router_users u where u.router_id = r.id) as users
       from routers r order by r.name`
  )).rows as { id: string; name: string; site_id: string; last_seen_at: Date | null; online: string; users: string }[]
  const metrics = (await pool.query(`select router_id, bucket, online, gateways from router_metrics where bucket > now() - interval '24 hours' order by bucket`)).rows as {
    router_id: string
    bucket: Date
    online: number | null
    gateways: { ip: string; sent: number; received: number; rtt: number | null }[]
  }[]
  const series: MonitorView["series"] = {}
  for (const m of metrics) (series[m.router_id] ??= []).push({ t: m.bucket.toISOString(), online: m.online, gateways: m.gateways })
  // Losing pings or slow (lib/wispdavor/monitor.ts ontFlag), pinged in the last hour; worst first.
  const onts = (await pool.query(
    `select router_id, "user", ont_rtt, ont_loss, ont_at from router_users
      where ont_at > now() - interval '1 hour' and (ont_loss > 0 or ont_rtt > 50)
      order by ont_loss desc nulls last, ont_rtt desc nulls last limit 100`
  )).rows as { router_id: string; user: string; ont_rtt: number | null; ont_loss: number | null; ont_at: Date }[]
  const outages = (await pool.query(`select id, router_id, kind, started_at, ended_at, baseline, low, detail from outages where ended_at is null or started_at > now() - interval '30 days' order by started_at desc limit 200`)).rows as {
    id: string
    router_id: string
    kind: OutageKind
    started_at: Date
    ended_at: Date | null
    baseline: number
    low: number
    detail: string
  }[]
  return {
    routers: routers.map((r) => ({ id: r.id, name: r.name, siteId: r.site_id, lastSeenAt: r.last_seen_at?.toISOString() ?? "", online: Number(r.online), users: Number(r.users) })),
    series,
    onts: onts.map((o) => ({ routerId: o.router_id, user: o.user, rtt: o.ont_rtt, loss: o.ont_loss, at: o.ont_at.toISOString() })),
    outages: outages.map((o) => ({ id: String(o.id), routerId: o.router_id, kind: o.kind, startedAt: o.started_at.toISOString(), endedAt: o.ended_at?.toISOString() ?? "", baseline: o.baseline, low: o.low, detail: o.detail })),
  }
}
