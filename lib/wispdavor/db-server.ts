/**
 * WispDavor's reads and writes of shared records on the server: a client and their payments as Cobranza has them, the
 * client's portal address, settings, and adding a payment to Cobranza through the sync server (so it has history and
 * reaches every phone). Server code only.
 */
import "server-only"
import { decodeClient, type Client } from "../clients/model"
import { getPool } from "../db/client"
import { decodePayment, newPayment, type Payment } from "../payments/model"
import { SITE_URL } from "../site"
import { sync } from "../sync/server"
import { DEFAULT_CFDI, type CfdiSettings } from "./cfdi"

export async function loadClient(id: string): Promise<Client | null> {
  const r = (await getPool().query(`select id, data from clients where id = $1 and deleted_at is null`, [id])).rows[0] as { id: string; data: unknown } | undefined
  const c = r ? decodeClient(r.data) : null
  if (c && r) c.id = r.id
  return c
}

export async function loadPayments(clientId: string): Promise<Payment[]> {
  return ((await getPool().query(`select data from payments where deleted_at is null and client_id = $1`, [clientId])).rows as { data: unknown }[])
    .map((r) => decodePayment(r.data))
    .filter((p): p is Payment => p !== null)
    .map((p) => ({ ...p, clientId }))
}

export async function loadPayment(id: string): Promise<Payment | null> {
  const r = (await getPool().query(`select data from payments where id = $1 and deleted_at is null`, [id])).rows[0] as { data: unknown } | undefined
  return r ? decodePayment(r.data) : null
}

/** The client's portal address (their active private link), else the public client area. */
export async function portalAddress(clientId: string): Promise<string> {
  const r = (await getPool().query(`select token from portal_links where client_id = $1 and revoked_at is null order by created_at desc limit 1`, [clientId])).rows[0] as { token: string } | undefined
  return r ? `${SITE_URL}/mi-cuenta#${r.token}` : `${SITE_URL}/clientes`
}

/**
 * A payment added to Cobranza the same way a phone adds one (decoded, versioned, synced). With a fixed id (an online
 * payment's), adding it again is the same record, never a second payment ("saved" or "kept-server" both mean it's there).
 */
export async function addPayment(p: Partial<Payment> & { clientId: string; amount: number; date: string }, editor: string): Promise<Payment> {
  const pay = newPayment({ ...p, by: editor, updatedAt: new Date().toISOString() })
  const r = await sync("payments", Number.MAX_SAFE_INTEGER - 1, [{ id: pay.id, baseVersion: null, data: pay, deleted: false, editedAt: pay.updatedAt }], editor)
  const out = r.results[0]
  if (!out || (out.outcome !== "saved" && out.outcome !== "kept-server")) throw new Error(`payment not saved: ${JSON.stringify(out)}`)
  return pay
}

const CFDI_KEY = "cfdi"

export async function getCfdiSettings(): Promise<CfdiSettings> {
  const r = (await getPool().query(`select value from wisp_settings where key = $1`, [CFDI_KEY])).rows[0] as { value: Partial<CfdiSettings> } | undefined
  return { ...DEFAULT_CFDI, ...(r?.value ?? {}) }
}

export async function saveCfdiSettings(s: CfdiSettings, by: string) {
  await getPool().query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [CFDI_KEY, JSON.stringify(s), by]
  )
}
