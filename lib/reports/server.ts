/**
 * Reports from the public form (/reportar → POST /api/reportes): written straight into the synced `reports` table
 * (version 1, a new `rev`), so every phone receives them on its next sync like any other record. The client is
 * matched by phone (last 10 digits of the phone or WhatsApp of exactly one client), which also gives the location.
 */
import "server-only"
import { getPool, hasDatabase } from "../db/client"
import type { ReportForm } from "../report-form"
import { defaultPriority, newReport, phoneKey, reportCode } from "./model"

export async function insertWebReport(form: Omit<ReportForm, "website" | "consent">): Promise<{ code: string } | null> {
  if (!hasDatabase()) return null
  const pool = getPool()
  const key = phoneKey(form.phone)
  const found = (
    await pool.query(
      `select id, data->>'siteId' as site from clients
       where deleted_at is null and (right(regexp_replace(coalesce(data->>'phone', ''), '\\D', '', 'g'), 10) = $1
         or right(regexp_replace(coalesce(data->>'whatsapp', ''), '\\D', '', 'g'), 10) = $1)
       limit 2`,
      [key]
    )
  ).rows as { id: string; site: string | null }[]
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
    by: "Formulario web",
  })
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query(`insert into reports (id, data, version, updated_by, status, category, client_id, source) values ($1, $2, 1, $3, $4, $5, $6, $7)`, [r.id, r, r.by, r.status, r.category, r.clientId, r.source])
    await c.query(`insert into report_versions (report_id, version, data, saved_by) values ($1, 1, $2, $3)`, [r.id, r, r.by])
    await c.query("commit")
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw e
  } finally {
    c.release()
  }
  return { code: reportCode(r) }
}
