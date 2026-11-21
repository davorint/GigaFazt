import type { NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { DEFAULT_CFDI, type CfdiSettings } from "@/lib/wispdavor/cfdi"
import { getCfdiSettings, loadClient, loadPayment, saveCfdiSettings } from "@/lib/wispdavor/db-server"
import { cancelCfdi, emailCfdi, facturamaConfigured, issueCfdi } from "@/lib/wispdavor/facturama-server"

const ID = /^[\w-]{6,64}$/
const fail = (e: unknown) => json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 400) : "error" }, 500)
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/**
 * CFDIs for staff (WispDavor → Facturas). GET: whether Facturama is set up (and sandbox), the settings and the issued
 * CFDIs. PUT {settings}: saves them. POST {action: "issue", paymentId} | {action: "email", id, email} | {action:
 * "cancel", id, motive}. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const configured = { facturama: facturamaConfigured(), sandbox: process.env.FACTURAMA_SANDBOX === "1" }
  if (!hasDatabase()) return json({ ok: true, configured, settings: DEFAULT_CFDI, cfdis: [] })
  try {
    const cfdis = (await getPool().query(`select id, client_id, payment_id, uuid, serie, folio, total, receiver_rfc, status, created_at, created_by, cancelled_at from cfdis order by created_at desc limit 500`)).rows
    return json({ ok: true, configured, settings: await getCfdiSettings(), cfdis })
  } catch (e) {
    return fail(e)
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as { settings?: Record<string, unknown> }
  const v = b.settings ?? {}
  const s: CfdiSettings = {
    expeditionPlace: text(v.expeditionPlace, 5),
    serie: text(v.serie, 10).toUpperCase(),
    productCode: text(v.productCode, 8),
    unitCode: text(v.unitCode, 3).toUpperCase() || DEFAULT_CFDI.unitCode,
    unit: text(v.unit, 40) || DEFAULT_CFDI.unit,
    description: text(v.description, 200) || DEFAULT_CFDI.description,
  }
  try {
    await saveCfdiSettings(s, await editorOf(request))
    return json({ ok: true, settings: s })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (!facturamaConfigured()) return json({ error: "not-configured" }, 409)
  const b = (await request.json().catch(() => ({}))) as { action?: unknown; paymentId?: unknown; id?: unknown; email?: unknown; motive?: unknown }
  try {
    if (b.action === "issue") {
      const paymentId = text(b.paymentId, 64)
      if (!ID.test(paymentId)) return json({ error: "bad-payment" }, 400)
      const p = await loadPayment(paymentId)
      const c = p ? await loadClient(p.clientId) : null
      if (!p || !c) return json({ error: "not-found" }, 404)
      // Paid by card online: Stripe said credit or debit (CFDI payment form 04 / 28).
      const row = (await getPool().query(`select s.card_funding from online_payments o join stripe_customers s on s.client_id = o.client_id where o.payment_id = $1 and o.kind in ('card', 'autopay') limit 1`, [p.id])).rows[0] as
        | { card_funding: string }
        | undefined
      const r = await issueCfdi(c, p, await getCfdiSettings(), await editorOf(request), row?.card_funding ?? "")
      return r.ok ? json({ ok: true, id: r.id, uuid: r.uuid }) : json({ error: r.error }, 409)
    }
    const id = text(b.id, 64)
    if (!ID.test(id)) return json({ error: "bad-id" }, 400)
    if (b.action === "email") {
      const email = text(b.email, 200)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad-email" }, 400)
      await emailCfdi(id, email)
      return json({ ok: true })
    }
    if (b.action === "cancel") {
      await cancelCfdi(id, text(b.motive, 2) || "02")
      return json({ ok: true })
    }
    return json({ error: "bad-action" }, 400)
  } catch (e) {
    return fail(e)
  }
}
