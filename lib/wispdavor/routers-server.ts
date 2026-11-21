/**
 * The server side of live router control (lib/wispdavor/routers.ts): routers and their keys, the agent's report (state,
 * traffic, results), the automatic differences, staff actions and traffic retention. Server code only.
 */
import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { decodeClient, withHold, type Client } from "../clients/model"
import { getPool } from "../db/client"
import { todayInMexico } from "../lead"
import { decodePayment, type Payment } from "../payments/model"
import { sync } from "../sync/server"
import { newId } from "../survey/id"
import { recordHealth, sweepSilent } from "./monitor-server"
import { MAX_ACTIONS, RESEND_MINUTES, SUSPENDED_PROFILE, actionLine, desiredUsers, diffRouter, parseReport, safe, unmanagedUsers, type Action, type ActionKind, type Desired, type Diff, type Unmanaged } from "./routers"

export type Router = { id: string; siteId: string; name: string; pppoe: boolean; hotspot: boolean; auto: boolean; lastSeenAt: string; createdAt: string }

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const toRouter = (r: Record<string, unknown>): Router => ({
  id: String(r.id),
  siteId: String(r.site_id ?? ""),
  name: String(r.name ?? ""),
  pppoe: r.pppoe === true,
  hotspot: r.hotspot === true,
  auto: r.auto === true,
  lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : "",
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : "",
})

export async function listRouters(): Promise<Router[]> {
  return ((await getPool().query(`select * from routers order by created_at`)).rows as Record<string, unknown>[]).map(toRouter)
}

/** A new router and its key (shown once: only its hash is kept). */
export async function createRouter(p: { siteId: string; name: string; pppoe: boolean; hotspot: boolean }, by: string): Promise<{ router: Router; key: string }> {
  const key = randomBytes(24).toString("base64url")
  const r = await getPool().query(`insert into routers (id, site_id, name, pppoe, hotspot, key_hash, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`, [newId(), p.siteId, p.name, p.pppoe, p.hotspot, sha(key), by])
  return { router: toRouter(r.rows[0] as Record<string, unknown>), key }
}

/** A new key for a router (the old one stops working: the router needs the new script). */
export async function rotateKey(id: string): Promise<string> {
  const key = randomBytes(24).toString("base64url")
  await getPool().query(`update routers set key_hash = $2 where id = $1`, [id, sha(key)])
  return key
}

export async function updateRouter(id: string, p: Partial<Pick<Router, "name" | "auto" | "pppoe" | "hotspot" | "siteId">>) {
  const r = (await getPool().query(`select * from routers where id = $1`, [id])).rows[0] as Record<string, unknown> | undefined
  if (!r) return
  const cur = toRouter(r)
  const n = { ...cur, ...p }
  await getPool().query(`update routers set name = $2, auto = $3, pppoe = $4, hotspot = $5, site_id = $6 where id = $1`, [id, n.name, n.auto, n.pppoe, n.hotspot, n.siteId])
  // An open outage follows the router to its deployment (the portal banner shows in the right building).
  if (n.siteId !== cur.siteId) await getPool().query(`update outages set site_id = $2 where router_id = $1 and ended_at is null`, [id, n.siteId])
}

export async function deleteRouter(id: string) {
  const pool = getPool()
  for (const t of ["router_actions", "router_users", "router_metrics"]) await pool.query(`delete from ${t} where router_id = $1`, [id])
  // Its open outage ends with it (else its building's clients would see the banner for good); history stays.
  await pool.query(`update outages set ended_at = now() where router_id = $1 and ended_at is null`, [id])
  await pool.query(`delete from routers where id = $1`, [id])
}

/** The router an agent's "Bearer <id>.<key>" belongs to, or null. */
export async function routerForAuth(header: string): Promise<Router | null> {
  const m = /^Bearer ([\w-]{6,64})\.([\w-]{20,64})$/.exec(header.trim())
  if (!m) return null
  const r = (await getPool().query(`select * from routers where id = $1`, [m[1]])).rows[0] as (Record<string, unknown> & { key_hash: string }) | undefined
  if (!r) return null
  const a = Buffer.from(sha(m[2]), "hex")
  const b = Buffer.from(r.key_hash, "hex")
  return a.length === b.length && timingSafeEqual(a, b) ? toRouter(r) : null
}

/** The clients of a deployment and their payments (what decides each PPPoE user's desired state). */
async function siteClients(siteId: string): Promise<{ clients: Client[]; payments: Payment[] }> {
  const pool = getPool()
  const rows = (await pool.query(`select id, data from clients where deleted_at is null and data->>'siteId' = $1`, [siteId])).rows as { id: string; data: unknown }[]
  const clients = rows.map((r) => {
    const c = decodeClient(r.data)
    if (c) c.id = r.id
    return c
  }).filter((c): c is Client => c !== null)
  if (!clients.length) return { clients, payments: [] }
  const pay = (await pool.query(`select client_id, data from payments where deleted_at is null and client_id = any($1)`, [clients.map((c) => c.id)])).rows as { client_id: string; data: unknown }[]
  // Each payment keeps its own row's client (decoded first, then filtered, so nothing shifts).
  const payments = pay.flatMap((r) => {
    const p = decodePayment(r.data)
    return p ? [{ ...p, clientId: r.client_id }] : []
  })
  return { clients, payments }
}

/** What the router has (its last report). */
async function routerState(routerId: string) {
  return (await getPool().query(`select "user", profile, disabled, active, seen_at from router_users where router_id = $1`, [routerId])).rows as { user: string; profile: string; disabled: boolean; active: boolean; seen_at: Date }[]
}

/** The differences and missing users of a router right now (for the staff page and the automatic switch). */
export async function routerDiff(r: Router): Promise<{ changes: Diff[]; missing: Desired[]; unmanaged: Unmanaged[] }> {
  if (!r.pppoe || !r.siteId) return { changes: [], missing: [], unmanaged: [] }
  const { clients, payments } = await siteClients(r.siteId)
  return { ...diffRouter(desiredUsers(clients, payments, todayInMexico()), await routerState(r.id)), unmanaged: unmanagedUsers(clients) }
}

/** Differences become actions (skipping a user with one already pending or recently sent). */
export async function queueDiffs(routerId: string, changes: Diff[], source: "auto" | "staff", by: string): Promise<number> {
  const pool = getPool()
  const busy = new Set(
    // Pending, recently sent, or failed in the last day (e.g. a plan that isn't a profile on the router): not again by
    // itself every 2 minutes; staff see the failure in the log and fix the plan or send it by hand.
    ((await pool.query(`select "user" from router_actions where router_id = $1 and (status = 'pending' or (status = 'sent' and sent_at > now() - interval '${RESEND_MINUTES} minutes') or (status = 'error' and source = 'auto' and done_at > now() - interval '1 day'))`, [routerId])).rows as { user: string }[]).map((x) => x.user)
  )
  let n = 0
  for (const d of changes) {
    if (busy.has(d.user)) continue
    await pool.query(`insert into router_actions (router_id, kind, "user", arg1, client_id, service_id, source, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [routerId, d.kind, d.user, d.profile, d.clientId, d.serviceId, source, by])
    busy.add(d.user)
    n++
  }
  return n
}

/** Any action queued by staff (create a user, vouchers…); values checked to be safe for the router. */
export async function queueAction(routerId: string, a: Omit<Action, "id">, extra: { clientId?: string; serviceId?: string; by: string }): Promise<number> {
  if (!actionLine({ ...a, id: 0 })) throw new Error("unsafe value")
  const r = await getPool().query(`insert into router_actions (router_id, kind, "user", arg1, arg2, arg3, arg4, client_id, service_id, source, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'staff', $10) returning id`, [
    routerId,
    a.kind,
    a.user,
    a.arg1,
    a.arg2,
    a.arg3,
    a.arg4,
    extra.clientId ?? "",
    extra.serviceId ?? "",
    extra.by,
  ])
  return Number((r.rows[0] as { id: string }).id)
}

const BUCKET_MS = 5 * 60 * 1000

/** One agent visit: store what it reports, close the actions it did, queue automatic changes, answer the next actions. */
export async function agentVisit(r: Router, body: string): Promise<string> {
  const pool = getPool()
  const report = parseReport(body)
  await pool.query(`update routers set last_seen_at = now() where id = $1`, [r.id])

  // Results of earlier actions; a done profile/disable/enable updates the service in Clientes.
  for (const d of report.done) {
    const a = (await pool.query(`update router_actions set status = $3, done_at = now(), result = $4 where id = $1 and router_id = $2 and status <> 'done' returning kind, "user", client_id, service_id, arg1`, [d.id, r.id, d.ok ? "done" : "error", d.ok ? "" : "el router no pudo aplicarla"])).rows[0] as
      | { kind: ActionKind; user: string; client_id: string; service_id: string; arg1: string }
      | undefined
    if (!a || !d.ok) continue
    // A created user's password is no longer needed once it's on the router.
    if (a.kind === "create") await pool.query(`update router_actions set arg2 = '' where id = $1`, [d.id])
    // Suspended or back on the plan: the service in Clientes follows (Cortes, the portal and Hoy read it).
    if (a.kind === "profile" && a.client_id && a.service_id) await setServiceStatus(a.client_id, a.service_id, a.arg1 === SUSPENDED_PROFILE ? "suspendido" : "activo")
    if (a.kind === "voucher") await pool.query(`update vouchers set status = 'ready' where code = $1 and router_id = $2 and status = 'pending'`, [a.user, r.id])
  }

  // State and traffic: the session counters grow until the user reconnects (then they start over).
  const bucket = new Date(Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS)
  const prev = new Map((await routerState(r.id)).map((x) => [x.user, x]))
  const counters = new Map(((await pool.query(`select "user", rx_last, tx_last from router_users where router_id = $1`, [r.id])).rows as { user: string; rx_last: string; tx_last: string }[]).map((x) => [x.user, x]))
  // One query per kind for the whole report (a router can have hundreds of users; one query each would be slow).
  // One row per user (a repeated name would make the batched upsert fail): the last line wins.
  const users = [...new Map(report.secrets.filter((s) => safe(s.user)).map((s) => [s.user, s])).values()]
  const stateOnly = users.filter((s) => s.stateOnly)
  const full = users.filter((s) => !s.stateOnly)
  if (stateOnly.length)
    // Plan and disabled only; connection and counters stay as last reported (no traffic is lost or counted twice).
    await pool.query(
      `insert into router_users (router_id, "user", profile, disabled, seen_at)
         select $1, u, p, d, now() from unnest($2::text[], $3::text[], $4::boolean[]) as x(u, p, d)
       on conflict (router_id, "user") do update set profile = excluded.profile, disabled = excluded.disabled, seen_at = now()`,
      [r.id, stateOnly.map((s) => s.user), stateOnly.map((s) => s.profile), stateOnly.map((s) => s.disabled)]
    )
  const traffic: { user: string; down: number; up: number }[] = []
  for (const s of full) {
    const c = counters.get(s.user)
    const rxLast = Number(c?.rx_last ?? 0)
    const txLast = Number(c?.tx_last ?? 0)
    const up = s.active ? (s.rx >= rxLast ? s.rx - rxLast : s.rx) : 0
    const down = s.active ? (s.tx >= txLast ? s.tx - txLast : s.tx) : 0
    // The first report of a session has no earlier counter to subtract from: it isn't counted as traffic.
    if ((up > 0 || down > 0) && prev.has(s.user)) traffic.push({ user: s.user, down, up })
  }
  if (full.length)
    await pool.query(
      `insert into router_users (router_id, "user", profile, disabled, active, rx_last, tx_last, seen_at)
         select $1, u, p, d, a, rx, tx, now() from unnest($2::text[], $3::text[], $4::boolean[], $5::boolean[], $6::bigint[], $7::bigint[]) as x(u, p, d, a, rx, tx)
       on conflict (router_id, "user") do update set profile = excluded.profile, disabled = excluded.disabled, active = excluded.active, rx_last = excluded.rx_last, tx_last = excluded.tx_last, seen_at = now()`,
      [r.id, full.map((s) => s.user), full.map((s) => s.profile), full.map((s) => s.disabled), full.map((s) => s.active), full.map((s) => String(s.active ? s.rx : 0)), full.map((s) => String(s.active ? s.tx : 0))]
    )
  if (traffic.length)
    await pool.query(
      `insert into traffic_5m (router_id, "user", bucket, down, up)
         select $1, u, $2, dn, upl from unnest($3::text[], $4::bigint[], $5::bigint[]) as x(u, dn, upl)
       on conflict (router_id, "user", bucket) do update set down = traffic_5m.down + excluded.down, up = traffic_5m.up + excluded.up`,
      [r.id, bucket, traffic.map((x) => x.user), traffic.map((x) => String(x.down)), traffic.map((x) => String(x.up))]
    )
  // Users no longer on the router (deleted there) leave WispDavor's copy too, so they show as missing again.
  if (users.length) await pool.query(`delete from router_users where router_id = $1 and not ("user" = any($2::text[]))`, [r.id, users.map((s) => s.user)])

  // Phase 4: sessions online, carrier and ONT pings, outages; a failure here never stops the router's actions.
  try {
    await recordHealth({ id: r.id, name: r.name, siteId: r.siteId }, bucket, full.length ? full.filter((s) => s.active).length : null, report.gateways, report.onts)
    await sweepSilent()
  } catch (e) {
    console.error("[routers] monitoring failed", e instanceof Error ? e.message.slice(0, 200) : "")
  }
  for (const h of report.hotspot) await pool.query(`update vouchers set uptime = $2, bytes = $3, status = case when $3 > 0 and status <> 'removed' then 'used' else status end where code = $1 and router_id = $4`, [h.name, h.uptime, h.bytes, r.id])

  // The automatic switch: the differences become actions by themselves.
  if (r.auto && r.pppoe && report.secrets.length) {
    const { changes } = await routerDiff(r)
    await queueDiffs(r.id, changes, "auto", "WispDavor")
  }

  // The next actions: pending ones, and sent ones the router never reported back.
  const next = (await pool.query(
    `select id, kind, "user", arg1, arg2, arg3, arg4 from router_actions where router_id = $1 and (status = 'pending' or (status = 'sent' and sent_at < now() - interval '${RESEND_MINUTES} minutes')) order by id limit ${MAX_ACTIONS}`,
    [r.id]
  )).rows as { id: string; kind: ActionKind; user: string; arg1: string; arg2: string; arg3: string; arg4: string }[]
  const lines: string[] = []
  for (const a of next) {
    const line = actionLine({ ...a, id: Number(a.id) })
    if (!line) {
      await pool.query(`update router_actions set status = 'error', result = 'valor no válido' where id = $1`, [a.id])
      continue
    }
    lines.push(line)
    await pool.query(`update router_actions set status = 'sent', sent_at = now() where id = $1`, [a.id])
  }
  return lines.join("\n")
}

/** A service's status in Clientes, saved like a phone's edit (history, sync) once the router applied it. */
async function setServiceStatus(clientId: string, serviceId: string, status: "activo" | "suspendido") {
  const row = (await getPool().query(`select data, version from clients where id = $1 and deleted_at is null`, [clientId])).rows[0] as { data: unknown; version: number } | undefined
  const c = row ? decodeClient(row.data) : null
  if (!row || !c) return
  const s = c.services.find((x) => x.id === serviceId)
  // A cancelled service stays cancelled: the router only suspends and reactivates.
  if (!s || s.status === status || s.status === "cancelado") return
  c.id = clientId
  // Back to active ends a manual hold today (the paused months stay uncharged).
  const next = { ...c, services: c.services.map((x) => (x.id === serviceId ? { ...(status === "activo" ? withHold(x, false, todayInMexico()) : x), status } : x)), updatedAt: new Date().toISOString() }
  await sync("clients", Number.MAX_SAFE_INTEGER - 1, [{ id: clientId, baseVersion: row.version, data: next, deleted: false, editedAt: next.updatedAt }], "Router (WispDavor)")
}

/** Retention (daily): 5-minute traffic older than 7 days becomes hourly; hourly older than 90 days and old actions go. */
export async function trafficRetention(): Promise<{ hourly: number; deleted5m: number; deletedHourly: number; deletedActions: number }> {
  const pool = getPool()
  // Moving to hourly and deleting the 5-minute rows happen together, with one cutoff: a failure in between would
  // otherwise add the same hours again on the next run (or drop rows never moved).
  const c = await pool.connect()
  let moved: { rowCount: number | null }
  let d5: { rowCount: number | null }
  try {
    await c.query("begin")
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    moved = await c.query(
      `insert into traffic_hourly (router_id, "user", hour, down, up)
         select router_id, "user", date_trunc('hour', bucket), sum(down), sum(up) from traffic_5m where bucket < $1 group by 1, 2, 3
       on conflict (router_id, "user", hour) do update set down = traffic_hourly.down + excluded.down, up = traffic_hourly.up + excluded.up`,
      [cutoff]
    )
    d5 = await c.query(`delete from traffic_5m where bucket < $1`, [cutoff])
    await c.query("commit")
  } catch (e) {
    await c.query("rollback").catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
  const dh = await pool.query(`delete from traffic_hourly where hour < now() - interval '90 days'`)
  const da = await pool.query(`delete from router_actions where status in ('done', 'error') and created_at < now() - interval '90 days'`)
  // Phase 4: sessions and carrier pings kept 14 days (outages stay).
  await pool.query(`delete from router_metrics where bucket < now() - interval '14 days'`)
  return { hourly: moved.rowCount ?? 0, deleted5m: d5.rowCount ?? 0, deletedHourly: dh.rowCount ?? 0, deletedActions: da.rowCount ?? 0 }
}

/**
 * WispDavor lines for the team's daily summary: routers that stopped reporting for over an hour (their automatic cuts
 * and reconnections stop with them) and router actions that failed in the last day. Empty when all is fine.
 */
export async function routerDigest(): Promise<string[]> {
  const pool = getPool()
  const quiet = (await pool.query(`select name, last_seen_at from routers where last_seen_at is null or last_seen_at < now() - interval '1 hour' order by name`)).rows as { name: string; last_seen_at: Date | null }[]
  const failed = Number(((await pool.query(`select count(*) from router_actions where status = 'error' and done_at > now() - interval '1 day'`)).rows[0] as { count: string }).count)
  const out: string[] = []
  if (quiet.length) {
    out.push(`📡 Routers sin reportarse: ${quiet.length} (sus cortes y reconexiones automáticas están detenidos)`)
    for (const r of quiet.slice(0, 10)) out.push(`• ${r.name}${r.last_seen_at ? ` · último reporte ${r.last_seen_at.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })}` : " · nunca se ha reportado"}`)
  }
  if (failed) out.push(`⚠️ Acciones de router que fallaron (24 h): ${failed} — WispDavor → Routers`)
  return out
}

