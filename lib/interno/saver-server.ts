/**
 * "Sincronización automática" on or off for the whole team (owner, 2026-11-26: a switch to stop the system's own
 * function invocations after the free Vercel plan ran out). Saved in wisp_settings under "ahorro". When off, the
 * phones stop their timed checks (lib/sync/engine.ts) and Monitoreo stops refreshing itself; they still sync when a page
 * opens, when something is saved and with "Sincronizar ahora", so nothing typed is lost. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"

const KEY = "ahorro"
export type Saver = { on: boolean; by: string; at: string }

export async function getSaver(): Promise<Saver> {
  const r = (await getPool().query(`select value, updated_by, updated_at from wisp_settings where key = $1`, [KEY])).rows[0] as { value: { on?: unknown } | null; updated_by: string | null; updated_at: Date | null } | undefined
  return { on: r?.value?.on === true, by: r?.updated_by ?? "", at: r?.updated_at ? r.updated_at.toISOString() : "" }
}

export async function setSaver(on: boolean, by: string): Promise<Saver> {
  await getPool().query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, JSON.stringify({ on }), by]
  )
  return getSaver()
}
