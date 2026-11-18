/**
 * Reports from the public form (/reportar → POST /api/reportes): written straight into the synced `reports` table
 * (version 1, a new `rev`), so every phone receives them on its next sync like any other record. The client is
 * matched by phone (last 10 digits of the phone or WhatsApp of exactly one client), which also gives the location.
 */
import "server-only"
import { getPool, hasDatabase } from "../db/client"
import type { ReportForm } from "../report-form"
import { DUP_HOURS, withinLimits } from "./limits"
import { defaultPriority, newReport, phoneKey, reportCode } from "./model"
import type { ReportAlert } from "./notify"

export type WebReportResult = { kind: "saved"; code: string; alert: ReportAlert } | { kind: "duplicate"; code: string } | { kind: "limited" } | null

/**
 * Saves a report from the public form. Checked first (lib/reports/limits.ts): the same phone with an open web report
 * in the last DUP_HOURS gets that code back; a sender over the hourly limits is refused. The consent time is stored
 * with the report (the form can't be sent without it).
 */
export async function insertWebReport(form: Omit<ReportForm, "website" | "consent">, hash: string, consentAt = new Date().toISOString()): Promise<WebReportResult> {
  if (!hasDatabase()) return null
  const pool = getPool()
  const key = phoneKey(form.phone)
  const dup = (
    await pool.query(
      `select id from reports where deleted_at is null and source = 'web' and status not in ('resuelto', 'descartado')
         and created_at > now() - make_interval(hours => $2) and right(regexp_replace(coalesce(data->>'phone', ''), '\\D', '', 'g'), 10) = $1
       order by created_at desc limit 1`,
      [key, DUP_HOURS]
    )
  ).rows[0] as { id: string } | undefined
  if (dup) return { kind: "duplicate", code: reportCode(dup) }
  if (!(await withinLimits(pool, hash))) return { kind: "limited" }
  const found = (
    await pool.query(
      `select id, data->>'siteId' as site, data->>'name' as name from clients
       where deleted_at is null and (right(regexp_replace(coalesce(data->>'phone', ''), '\\D', '', 'g'), 10) = $1
         or right(regexp_replace(coalesce(data->>'whatsapp', ''), '\\D', '', 'g'), 10) = $1)
       limit 2`,
      [key]
    )
  ).rows as { id: string; site: string | null; name: string | null }[]
  const client = found.length === 1 ? found[0] : null
  const r = newReport({
    source: "web",
    name: form.name,
    phone: form.phone,
    address: form.address,
    category: form.category,
    description: form.description,
    priority: defaultPriority(form.category),
    clientId: client?.id ?? "",
    siteId: client?.site ?? "",
    consentAt,
    by: "Formulario web",
  })
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query(`insert into reports (id, data, version, updated_by, status, category, client_id, source) values ($1, $2, 1, $3, $4, $5, $6, $7)`, [r.id, r, r.by, r.status, r.category, r.clientId, r.source])
    await c.query(`insert into report_versions (report_id, version, data, saved_by) values ($1, 1, $2, $3)`, [r.id, r, r.by])
    await c.query(`insert into report_hits (ip_hash) values ($1)`, [hash])
    await c.query("commit")
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw e
  } finally {
    c.release()
  }
  // For the alert: the location's name and its other open reports of the last 24 h.
  let siteName = ""
  let sameSite = 0
  if (r.siteId) {
    siteName = ((await pool.query(`select data->>'name' as name from sites where id = $1`, [r.siteId])).rows[0] as { name: string | null } | undefined)?.name ?? ""
    sameSite = ((await pool.query(
      `select count(*)::int as n from reports where deleted_at is null and id <> $1 and data->>'siteId' = $2 and status not in ('resuelto', 'descartado') and created_at > now() - interval '24 hours'`,
      [r.id, r.siteId]
    )).rows[0] as { n: number }).n
  }
  const code = reportCode(r)
  return {
    kind: "saved",
    code,
    alert: { id: r.id, code, category: r.category, priority: r.priority, name: r.name, phone: r.phone, address: r.address, description: r.description, clientName: client?.name ?? "", siteName, sameSite },
  }
}
