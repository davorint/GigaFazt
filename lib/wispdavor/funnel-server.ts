/**
 * The collections funnel's events (phase 6), from what's already recorded: notices = reminder and cut-off WhatsApps sent
 * by the API (whatsapp_sends) and every "recordado" day in the clients' saved versions (Cobranza's reminder walk and
 * WispDavor's one-tap links set it); suspensions = the days a client's saved version had an internet service suspended
 * for debt (not a manual hold). Days in Mexico City. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import type { FunnelEvent } from "./funnel"

export async function funnelEvents(sinceDay: string): Promise<FunnelEvent[]> {
  const pool = getPool()
  const sends = (await pool.query(
    `select client_id, (sent_at at time zone 'America/Mexico_City')::date::text as day from whatsapp_sends
      where status = 'sent' and template in ('recordatorio', 'corte') and client_id <> '' and sent_at >= $1::date group by 1, 2`,
    [sinceDay]
  )).rows as { client_id: string; day: string }[]
  const reminded = (await pool.query(
    `select client_id, data->>'remindedAt' as day from client_versions
      where coalesce(data->>'remindedAt', '') >= $1 group by 1, 2`,
    [sinceDay]
  )).rows as { client_id: string; day: string }[]
  const suspended = (await pool.query(
    `select client_id, (saved_at at time zone 'America/Mexico_City')::date::text as day from client_versions
      where saved_at >= $1::date and jsonb_path_exists(data, '$.services[*] ? (@.type == "internet" && @.status == "suspendido" && !(@.hold == true))')
      group by 1, 2`,
    [sinceDay]
  )).rows as { client_id: string; day: string }[]
  return [
    ...sends.map((r) => ({ clientId: r.client_id, kind: "aviso" as const, day: r.day })),
    ...reminded.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)).map((r) => ({ clientId: r.client_id, kind: "aviso" as const, day: r.day })),
    ...suspended.map((r) => ({ clientId: r.client_id, kind: "suspension" as const, day: r.day })),
  ]
}
