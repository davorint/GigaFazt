/**
 * History and recovery for the synced records (owner, 2026-11-18): every saved version of one record (the database
 * keeps them all, including the copy that lost a conflict), the records deleted lately (deleting only marks them),
 * and a full backup of everything. Restoring is done on the phone: it saves the chosen version as a normal edit, so
 * it syncs and lands in the history like any other change. Server code only, behind the /interno password.
 */
import "server-only"
import { getPool } from "../db/client"
import { SYNC_KINDS, type SyncKind } from "./protocol"
import { SPECS } from "./server"

const ID = /^[\w-]{6,64}$/

export type Version = { version: number; savedAt: string; savedBy: string; conflict: boolean; data: unknown }
export type Deleted = { id: string; deletedAt: string; by: string; data: unknown }

/** The saved versions of one record, newest first. */
export async function versionsOf(kind: SyncKind, id: string, limit = 60): Promise<Version[]> {
  if (!ID.test(id)) return []
  const s = SPECS[kind]
  const rows = (await getPool().query(`select version, data, saved_at, saved_by, conflict from "${s.versions}" where ${s.fk} = $1 order by id desc limit $2`, [id, limit])).rows as {
    version: number
    data: unknown
    saved_at: Date
    saved_by: string
    conflict: boolean
  }[]
  return rows.map((r) => ({ version: r.version, savedAt: r.saved_at.toISOString(), savedBy: r.saved_by, conflict: r.conflict, data: r.data }))
}

/** Records deleted in the last `days` days, newest first (deleted starters that were never edited are left out). */
export async function deletedOf(kind: SyncKind, days = 90, limit = 100): Promise<Deleted[]> {
  const s = SPECS[kind]
  const rows = (
    await getPool().query(`select id, data, deleted_at, updated_by from "${s.table}" where deleted_at is not null and deleted_at > now() - make_interval(days => $1) order by deleted_at desc limit $2`, [days, limit])
  ).rows as { id: string; data: unknown; deleted_at: Date; updated_by: string }[]
  return rows
    .filter((r) => r.data && typeof r.data === "object" && Object.keys(r.data).length > 1)
    .map((r) => ({ id: r.id, deletedAt: r.deleted_at.toISOString(), by: r.updated_by, data: r.data }))
}

/** Everything in the database that isn't deleted: every kind of record, the saved MikroTik deployments and the website leads. */
export async function fullBackup() {
  const pool = getPool()
  const out: Record<string, unknown> = { app: "gigafazt-interno", kind: "respaldo", v: 1, at: new Date().toISOString() }
  for (const k of SYNC_KINDS) {
    out[k] = ((await pool.query(`select data from "${SPECS[k].table}" where deleted_at is null order by created_at`)).rows as { data: unknown }[]).map((r) => r.data)
  }
  out.deployments = (await pool.query(`select id, name, data, updated_at from deployments where deleted_at is null order by created_at`)).rows
  out.leads = (await pool.query(`select * from leads order by created_at`)).rows
  return out
}
