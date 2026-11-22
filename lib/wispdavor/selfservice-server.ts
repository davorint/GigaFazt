/**
 * Automatic WhatsApp notices (phase 9; rules in lib/wispdavor/selfservice.ts): the payment reminders of the daily job and
 * the report updates sent when a report is saved as "visita" or "resuelto". Both need an admin to turn them on (Avisos)
 * and the WhatsApp keys on the host; each goes once (its key in whatsapp_sends.ref). Server code only.
 */
import "server-only"
import { clientLabel, decodeClient, type Client } from "../clients/model"
import { getPool } from "../db/client"
import { decodePayment, ledger, type Payment } from "../payments/model"
import { mxn } from "../materials/catalog"
import { reportCode } from "../reports/model"
import { portalAddress } from "./db-server"
import { NOTIFY_STATUSES, STATUS_WORDS, decodeNotices, payBy, reminderRef, reminderToday, reportRef, type AutoNotices } from "./selfservice"
import { waNumber } from "./whatsapp"
import { sendTemplate, whatsappConfigured } from "./whatsapp-server"

const KEY = "autoavisos"
const BY = "Avisos automáticos"

export async function getNotices(): Promise<AutoNotices> {
  const r = (await getPool().query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: unknown } | undefined
  return decodeNotices(r?.value)
}

export async function saveNotices(v: unknown, by: string): Promise<AutoNotices> {
  const s = decodeNotices(v)
  await getPool().query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, s, by]
  )
  return s
}

const firstName = (c: Client) => (c.name.trim().split(/\s+/)[0] || clientLabel(c)).slice(0, 60)

/** Sent once per key: true when this key already went to this client (sent or failed: no retry storms). */
async function alreadySent(clientId: string, ref: string) {
  return ((await getPool().query(`select 1 from whatsapp_sends where client_id = $1 and ref = $2 limit 1`, [clientId, ref])).rowCount ?? 0) > 0
}

export type ReminderRun = { template: string; sent: number; skipped: number; failed: number }

/** The daily job's reminders (see the rules file). */
export async function runReminders(today: string): Promise<ReminderRun> {
  const s = await getNotices()
  const template = reminderToday(today, s)
  const out: ReminderRun = { template: template ?? "", sent: 0, skipped: 0, failed: 0 }
  if (!template || !whatsappConfigured()) return out
  const pool = getPool()
  const clients = ((await pool.query(`select id, data from clients where deleted_at is null`)).rows as { id: string; data: unknown }[]).flatMap((r) => {
    const c = decodeClient(r.data)
    return c ? [{ ...c, id: r.id }] : []
  })
  const payments = ((await pool.query(`select data from payments where deleted_at is null`)).rows as { data: unknown }[]).map((r) => decodePayment(r.data)).filter((p): p is Payment => p !== null)
  const autopay = new Set(((await pool.query(`select client_id from stripe_customers where autopay and payment_method_id <> ''`).catch(() => ({ rows: [] }))).rows as { client_id: string }[]).map((r) => r.client_id))
  const ref = reminderRef(template, today)
  for (const c of clients) {
    const l = ledger(c, payments.filter((p) => p.clientId === c.id), today)
    const to = waNumber(c.whatsapp || c.phone)
    const promised = Boolean(c.promiseDate && c.promiseDate >= today)
    // The cut-off notice only to someone who still has service to lose (one already suspended gets nothing from it).
    const live = c.services.some((x) => x.type === "internet" && x.status === "activo")
    if (l.owed < 1 || !to || autopay.has(c.id) || (template === "corte" && (promised || !live)) || !c.services.some((x) => x.status !== "cancelado")) {
      out.skipped++
      continue
    }
    if (await alreadySent(c.id, ref)) {
      out.skipped++
      continue
    }
    const r = await sendTemplate(to, template, [firstName(c), mxn(Math.round(l.owed * 100) / 100), payBy(today), await portalAddress(c.id)], { clientId: c.id, by: BY, ref })
    if (r.ok) out.sent++
    else out.failed++
  }
  return out
}

export type ReportChange = { id: string; clientId: string; status: string }

/** After reports are saved: the client hears when theirs goes to "visita" or "resuelto" (if turned on). */
export async function notifyReportChanges(changes: ReportChange[]): Promise<number> {
  const due = changes.filter((c) => c.clientId && (NOTIFY_STATUSES as readonly string[]).includes(c.status))
  if (!due.length || !whatsappConfigured() || !(await getNotices()).reportUpdates) return 0
  let sent = 0
  for (const ch of due) {
    const ref = reportRef(ch.id, ch.status)
    if (await alreadySent(ch.clientId, ref)) continue
    const row = (await getPool().query(`select data from clients where id = $1 and deleted_at is null`, [ch.clientId])).rows[0] as { data: unknown } | undefined
    const c = row ? decodeClient(row.data) : null
    const to = c ? waNumber(c.whatsapp || c.phone) : null
    if (!c || !to) continue
    const r = await sendTemplate(to, "reporte", [firstName(c), reportCode({ id: ch.id }), STATUS_WORDS[ch.status as (typeof NOTIFY_STATUSES)[number]], await portalAddress(ch.clientId)], { clientId: ch.clientId, by: BY, ref })
    if (r.ok) sent++
  }
  return sent
}
