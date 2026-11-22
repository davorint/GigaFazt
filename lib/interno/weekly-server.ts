/**
 * The Monday summary (phase 10; text in lib/interno/outlook.ts): sent by WispDavor's daily job on Mondays (Mexico City),
 * once per Monday (the date is kept in wisp_settings), to the team's chat (Telegram / the webhook). Server code only.
 */
import "server-only"
import { decodeClient, type Client } from "../clients/model"
import { getPool } from "../db/client"
import { decodePayment, type Payment } from "../payments/model"
import { decodeReport, type Report } from "../reports/model"
import { sendText } from "../reports/notify"
import { SITE_URL } from "../site"
import { monthNumbers } from "./numbers"
import { weeklyText } from "./outlook"

const KEY = "semanal"

const rows = async <T,>(table: string, decode: (v: unknown) => T | null): Promise<T[]> =>
  ((await getPool().query(`select id, data from ${table} where deleted_at is null`)).rows as { id: string; data: unknown }[]).flatMap((r) => {
    const d = decode(r.data)
    return d ? [{ ...d, id: r.id }] : []
  })

/** Sends the summary when today is a Monday and it hasn't gone today; `force` sends it any day (staff's button). */
export async function runWeekly(today: string, force = false): Promise<{ sent: boolean; reason?: string }> {
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1
  if (!monday && !force) return { sent: false, reason: "not-monday" }
  const pool = getPool()
  const last = ((await pool.query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: { date?: string } } | undefined)?.value?.date
  if (!force && last === today) return { sent: false, reason: "already" }
  const clients = await rows<Client>("clients", decodeClient)
  const payments = await rows<Payment>("payments", decodePayment)
  const reports = await rows<Report>("reports", decodeReport)
  const outages = Number(((await pool.query(`select count(*)::int as n from outages where started_at > now() - interval '7 days'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0] as { n: number }).n)
  const [m] = monthNumbers(clients, payments, reports, [today.slice(0, 7)])
  const text = weeklyText({ clients, payments, reports, today, outages, expectedMonth: m.expected, collectedMonth: m.collected, link: `${SITE_URL}/interno/admin/numeros` })
  const r = await sendText("semanal", text)
  // No chat set up on the host (Telegram or webhook): nothing went, so it isn't marked as sent.
  if (r.telegram === null && r.webhook === null) return { sent: false, reason: "no-channel" }
  if (r.telegram === false && r.webhook !== true) return { sent: false, reason: "failed" }
  await pool.query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, 'Resumen semanal') on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, { date: today }]
  )
  return { sent: true }
}
