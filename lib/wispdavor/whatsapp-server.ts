/**
 * Sending WhatsApp template messages through Meta's Cloud API (POST /{phone-number-id}/messages). The keys live only on
 * the host: WHATSAPP_TOKEN (a system user's permanent token) and WHATSAPP_PHONE_NUMBER_ID; WHATSAPP_GRAPH_VERSION
 * overrides the Graph API version. Every send is logged in `whatsapp_sends`. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import { LANGUAGE, TEMPLATES, cleanParam, type TemplateId } from "./whatsapp"

/** Graph API version (override with WHATSAPP_GRAPH_VERSION when Meta retires it). */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0"

export const whatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim())

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string }

export async function sendTemplate(to: string, id: TemplateId, values: string[], log: { clientId: string; by: string }): Promise<SendResult> {
  const t = TEMPLATES[id]
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: t.name,
      language: { code: LANGUAGE },
      components: [{ type: "body", parameters: t.params.map((_, i) => ({ type: "text", text: cleanParam(values[i] ?? "") || "-" })) }],
    },
  }
  let result: SendResult
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
    result = res.ok && json.messages?.[0]?.id ? { ok: true, messageId: json.messages[0].id } : { ok: false, error: `${res.status} ${json.error?.code ?? ""} ${json.error?.message ?? ""}`.trim().slice(0, 300) }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "error" }
  }
  await getPool().query(`insert into whatsapp_sends (client_id, template, phone, status, message_id, error, sent_by) values ($1, $2, $3, $4, $5, $6, $7)`, [
    log.clientId,
    t.name,
    to,
    result.ok ? "sent" : "error",
    result.ok ? result.messageId : "",
    result.ok ? "" : result.error,
    log.by,
  ])
  return result
}
