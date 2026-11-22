/**
 * Requests a client sends from their portal (owner, 2026-11-21: "Request a plan change"): saved as a report in Reportes
 * (category "otro", the client already matched) so the team sees it where it sees the rest, and the team is alerted.
 * Nothing changes by itself: the team applies the new plan from the next month (Cobranza dates prices that way).
 * Phase 9 (2026-11-22): faults reported from the portal too, with an optional photo (stored like Técnico's photos).
 */
import "server-only"
import type { Client } from "../clients/model"
import { getPool } from "../db/client"
import { speedLabel } from "../format"
import { getPlan } from "../plans"
import { sendText } from "../reports/notify"
import { newReport, reportCode, type Report, type ReportCategory } from "../reports/model"
import { saveFieldFile } from "../field/storage"
import { newId } from "../survey/id"
import { DUP_HOURS, MAX_DESCRIPTION, PORTAL_CATEGORIES, portalPriority } from "./selfservice"
import { mxn } from "../materials/catalog"

const PREFIX = "Solicitud de cambio de plan desde el portal"
/** One open request per client within this many days (a second tap answers the first one's code). */
const DUP_DAYS = 30

export type PlanRequest = { kind: "saved" | "duplicate"; code: string } | { kind: "bad-plan" } | { kind: "same-plan" }

export async function requestPlanChange(c: Client, planId: string): Promise<PlanRequest> {
  const plan = getPlan(planId)
  if (!plan || typeof plan.priceMxn !== "number") return { kind: "bad-plan" }
  const label = speedLabel(plan.downMbps)
  const current = c.services.find((s) => s.type === "internet" && s.status !== "cancelado")?.plan.trim() ?? ""
  // Clientes names plans like the router profiles ("200M"); the same speed is the same plan.
  if (current && Number(/\d+/.exec(current)?.[0]) * (/g/i.test(current) ? 1000 : 1) === plan.downMbps) return { kind: "same-plan" }
  const pool = getPool()
  const dup = (await pool.query(
    `select id from reports where deleted_at is null and client_id = $1 and status not in ('resuelto', 'descartado')
       and data->>'description' like $2 and created_at > now() - make_interval(days => $3) order by created_at desc limit 1`,
    [c.id, `${PREFIX}%`, DUP_DAYS]
  )).rows[0] as { id: string } | undefined
  if (dup) return { kind: "duplicate", code: reportCode(dup) }
  const r = newReport({
    source: "web",
    name: c.name,
    phone: c.whatsapp || c.phone,
    address: [c.building, c.tower, c.apartment].filter(Boolean).join(" · "),
    category: "otro",
    priority: "normal",
    description: `${PREFIX}: de ${current || "sin plan"} a ${label} (${mxn(plan.priceMxn)} al mes). Aplicar a partir del mes siguiente.`,
    clientId: c.id,
    siteId: c.siteId,
    by: "Portal del cliente",
  })
  await insertReport(r)
  const code = reportCode(r)
  await sendText("plan", `🔁 ${c.name || c.id} pide cambiar de plan: ${current || "sin plan"} → ${label} · ${code} (Reportes)`).catch(() => undefined)
  return { kind: "saved", code }
}

/** A report and its first version, in one transaction. */
async function insertReport(r: Report) {
  const db = await getPool().connect()
  try {
    await db.query("begin")
    await db.query(`insert into reports (id, data, version, updated_by, status, category, client_id, source) values ($1, $2, 1, $3, $4, $5, $6, $7)`, [r.id, r, r.by, r.status, r.category, r.clientId, r.source])
    await db.query(`insert into report_versions (report_id, version, data, saved_by) values ($1, 1, $2, $3)`, [r.id, r, r.by])
    await db.query("commit")
  } catch (e) {
    await db.query("rollback").catch(() => undefined)
    throw e
  } finally {
    db.release()
  }
}

const FAULT_BY = "Portal del cliente"

export type FaultReport = { kind: "saved" | "duplicate"; code: string } | { kind: "bad-category" } | { kind: "empty" }

/**
 * A fault the client reports from their portal: a report in Reportes already matched to them (their name, WhatsApp,
 * apartment and deployment), with the photo if they sent one; the team is alerted. A second report within DUP_HOURS
 * while the first is still open answers the first's code (no duplicates from repeated taps).
 */
export async function reportFault(c: Client, input: { category: string; description: string; photo?: { bytes: Buffer; mime: string; name: string } }): Promise<FaultReport> {
  const category = PORTAL_CATEGORIES.find((x) => x === input.category) as ReportCategory | undefined
  if (!category) return { kind: "bad-category" }
  const description = input.description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION)
  if (!description && category === "otro") return { kind: "empty" }
  const pool = getPool()
  const dup = (await pool.query(
    `select id from reports where deleted_at is null and client_id = $1 and source = 'web' and status not in ('resuelto', 'descartado')
       and data->>'by' = $2 and data->>'description' not like $4 and created_at > now() - make_interval(hours => $3) order by created_at desc limit 1`,
    [c.id, FAULT_BY, DUP_HOURS, `${PREFIX}%`]
  )).rows[0] as { id: string } | undefined
  if (dup) return { kind: "duplicate", code: reportCode(dup) }
  const r = newReport({
    source: "web",
    name: c.name,
    phone: c.whatsapp || c.phone,
    address: [c.building, c.tower, c.apartment].filter(Boolean).join(" · "),
    category,
    priority: portalPriority(category),
    description,
    clientId: c.id,
    siteId: c.siteId,
    by: FAULT_BY,
  })
  if (input.photo) {
    const id = newId()
    await saveFieldFile({ id, ref: { kind: "reporte", id: r.id }, kind: "foto", name: input.photo.name, mime: input.photo.mime, bytes: input.photo.bytes, by: FAULT_BY })
    r.field = { ...r.field, files: [{ id, kind: "foto", name: input.photo.name }] }
  }
  await insertReport(r)
  const code = reportCode(r)
  await sendText("reporte", `🛠️ ${c.name || c.id} reportó desde su portal: ${category}${description ? ` · ${description.slice(0, 140)}` : ""}${input.photo ? " · con foto" : ""} · ${code} (Reportes)`).catch(() => undefined)
  return { kind: "saved", code }
}
