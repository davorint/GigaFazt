/**
 * Router configuration copies on the server (phase 7; rules in lib/wispdavor/backups.ts): one place that keeps a copy,
 * however it came (the agent's pieces or Router en vivo over REST/API): a configuration the same as the last copy isn't
 * kept again (its check time is), a changed one is kept and, when it came on its own (the daily copy), the team is told;
 * the last KEEP_BACKUPS per router stay. The daily copy is queued as an agent action once a day per router.
 */
import "server-only"
import { createHash } from "node:crypto"
import { getPool } from "../db/client"
import { sendText } from "../reports/notify"
import { SITE_URL } from "../site"
import { KEEP_BACKUPS, diffConfigs, handChanges, normalizeConfig } from "./backups"

const LINK = `${SITE_URL}/interno/software/wispdavor/routers`

export type SavedConfig = { kind: "new"; id: string; size: number; added: number; removed: number } | { kind: "same"; id: string; size: number }

/** Keeps a router's configuration (see the file's comment). `auto`: the daily copy (alerts on a change). */
export async function saveConfig(routerId: string, text: string, source: "rest" | "agente", by: string, auto = false): Promise<SavedConfig> {
  const pool = getPool()
  const hash = createHash("sha256").update(normalizeConfig(text)).digest("hex")
  const last = (await pool.query(`select id, text, hash, created_at from router_backups where router_id = $1 order by created_at desc limit 1`, [routerId])).rows[0] as
    | { id: string; text: string; hash: string; created_at: Date }
    | undefined
  if (last && (last.hash || createHash("sha256").update(normalizeConfig(last.text)).digest("hex")) === hash) {
    await pool.query(`update router_backups set checked_at = now() where id = $1`, [last.id])
    return { kind: "same", id: String(last.id), size: text.length }
  }
  const id = String(((await pool.query(`insert into router_backups (router_id, text, created_by, source, hash) values ($1, $2, $3, $4, $5) returning id`, [routerId, text, by, source, hash])).rows[0] as { id: string }).id)
  await pool.query(`delete from router_backups where router_id = $1 and id not in (select id from router_backups where router_id = $1 order by created_at desc limit ${KEEP_BACKUPS})`, [routerId])
  const d = last ? diffConfigs(last.text, text) : { added: [], removed: [] }
  // Someone changed the router by hand since the last copy: the team hears of it (only from the daily copy, so a copy
  // staff asked for right after their own change doesn't alert; WispDavor's own PPPoE and hotspot changes don't count).
  const hand = handChanges(d)
  if (auto && last && (hand.added.length || hand.removed.length)) {
    const name = ((await pool.query(`select name from routers where id = $1`, [routerId])).rows[0] as { name: string } | undefined)?.name ?? routerId
    const when = last.created_at.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })
    await sendText("respaldo", `⚙️ ${name}: su configuración cambió desde la copia del ${when} (+${hand.added.length} / −${hand.removed.length} líneas, sin contar usuarios PPPoE ni fichas)\n${LINK}`).catch(() => undefined)
  }
  return { kind: "new", id, size: text.length, added: d.added.length, removed: d.removed.length }
}

/** One piece from the router; when the last one is in, the copy is put together and kept. */
export async function receivePart(routerId: string, p: { upload: string; idx: number; total: number }, data: string): Promise<SavedConfig | "partial"> {
  const pool = getPool()
  await pool.query(
    `insert into router_backup_parts (router_id, upload, idx, total, data) values ($1, $2, $3, $4, $5)
     on conflict (router_id, upload, idx) do update set data = excluded.data, total = excluded.total`,
    [routerId, p.upload, p.idx, p.total, data]
  )
  const parts = (await pool.query(`select idx, data from router_backup_parts where router_id = $1 and upload = $2 and total = $3 order by idx`, [routerId, p.upload, p.total])).rows as { idx: number; data: string }[]
  if (parts.length < p.total) return "partial"
  // Whoever asked for it (staff's name, or the daily job) is on its action.
  const a = (await pool.query(`select source, created_by from router_actions where id = $1 and router_id = $2`, [p.upload, routerId])).rows[0] as { source: string; created_by: string } | undefined
  const saved = await saveConfig(routerId, parts.map((x) => x.data).join(""), "agente", a?.created_by || "Router", a?.source === "auto")
  await pool.query(`delete from router_backup_parts where router_id = $1 and upload = $2`, [routerId, p.upload])
  return saved
}

/** The daily copy: an agent action once a day per router (Mexico City's day), unless one is already on its way. */
export async function queueDailyBackup(routerId: string): Promise<boolean> {
  const pool = getPool()
  const today = (await pool.query(
    `select 1 from router_actions where router_id = $1 and kind = 'backup'
       and (created_at at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date limit 1`,
    [routerId]
  )).rowCount
  if (today) return false
  await pool.query(`insert into router_actions (router_id, kind, source, created_by) values ($1, 'backup', 'auto', 'Copia diaria')`, [routerId])
  return true
}

/** A copy asked for now (the router sends it at its next report). */
export async function queueBackup(routerId: string, by: string): Promise<void> {
  const pending = (await getPool().query(`select 1 from router_actions where router_id = $1 and kind = 'backup' and status in ('pending', 'sent') limit 1`, [routerId])).rowCount
  if (!pending) await getPool().query(`insert into router_actions (router_id, kind, source, created_by) values ($1, 'backup', 'staff', $2)`, [routerId, by])
}

export async function backupsOf(routerId: string) {
  return (await getPool().query(`select id, created_at, created_by, source, checked_at, length(text) as size from router_backups where router_id = $1 order by created_at desc`, [routerId])).rows as {
    id: string
    created_at: Date
    created_by: string
    source: string
    checked_at: Date | null
    size: number
  }[]
}

/**
 * The last copy asked of the router (daily or staff) and how it went: "pending"/"sent" = on its way; "error" = the
 * router failed (its message in `result`); "missing" = the router says done but no copy arrived after it was asked
 * (its script is older than phase 7: paste it again).
 */
export async function lastAsk(routerId: string): Promise<{ status: string; at: string; result: string } | null> {
  const pool = getPool()
  const a = (await pool.query(`select status, result, created_at, done_at from router_actions where router_id = $1 and kind = 'backup' order by created_at desc limit 1`, [routerId])).rows[0] as
    | { status: string; result: string; created_at: Date; done_at: Date | null }
    | undefined
  if (!a) return null
  let status = a.status
  if (status === "done") {
    const got = (await pool.query(`select 1 from router_backups where router_id = $1 and source = 'agente' and greatest(created_at, coalesce(checked_at, created_at)) >= $2 limit 1`, [routerId, a.created_at])).rowCount
    if (!got) status = "missing"
  }
  return { status, at: a.created_at.toISOString(), result: a.result.slice(0, 200) }
}

export async function backupText(id: string): Promise<{ routerId: string; text: string; createdAt: Date } | null> {
  const r = (await getPool().query(`select router_id, text, created_at from router_backups where id = $1`, [id])).rows[0] as { router_id: string; text: string; created_at: Date } | undefined
  return r ? { routerId: r.router_id, text: r.text, createdAt: r.created_at } : null
}

/** Retention: pieces of a copy that never finished (the router stopped halfway), after a day. */
export async function dropStaleParts() {
  await getPool().query(`delete from router_backup_parts where created_at < now() - interval '1 day'`)
}
