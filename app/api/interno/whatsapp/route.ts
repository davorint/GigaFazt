import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { MAX_PER_SEND, TEMPLATES, TEMPLATE_IDS, waNumber, type TemplateId } from "@/lib/wispdavor/whatsapp"
import { sendTemplate, whatsappConfigured } from "@/lib/wispdavor/whatsapp-server"

/**
 * WhatsApp notices through the Cloud API (WispDavor → Avisos). GET: whether the keys are on the host. POST {template,
 * items: [{clientId, phone, values}]}: sends each (at most MAX_PER_SEND), one after another, and answers each result.
 * Signed in only; every send is logged.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  return json({ ok: true, configured: whatsappConfigured() && hasDatabase() })
}

type Item = { clientId?: unknown; phone?: unknown; values?: unknown }

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (!whatsappConfigured()) return json({ error: "not-configured" }, 409)
  const body = (await request.json().catch(() => ({}))) as { template?: unknown; items?: unknown }
  const template = TEMPLATE_IDS.find((t) => t === body.template) as TemplateId | undefined
  const items = Array.isArray(body.items) ? (body.items as Item[]) : []
  if (!template || !items.length || items.length > MAX_PER_SEND) return json({ error: "bad-request" }, 400)
  const by = await editorOf(request)
  const results: { clientId: string; ok: boolean; error?: string }[] = []
  for (const it of items) {
    const clientId = typeof it.clientId === "string" ? it.clientId.slice(0, 64) : ""
    const to = typeof it.phone === "string" ? waNumber(it.phone) : null
    const values = Array.isArray(it.values) ? it.values.slice(0, TEMPLATES[template].params.length).map((x) => String(x ?? "")) : []
    if (!to) {
      results.push({ clientId, ok: false, error: "phone" })
      continue
    }
    const r = await sendTemplate(to, template, values, { clientId, by })
    results.push(r.ok ? { clientId, ok: true } : { clientId, ok: false, error: r.error })
  }
  return json({ ok: true, results })
}
