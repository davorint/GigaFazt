/**
 * Alerts for a new report from the public form, so a client without internet isn't left waiting until someone opens
 * Reportes de clientes (owner, 2026-11-18). Sent after the client already has the answer (`after()`), never blocking it.
 *
 * Channels, each switched on by its host variables (nothing in the repository):
 * - Telegram: REPORT_TELEGRAM_BOT_TOKEN + REPORT_TELEGRAM_CHAT_ID (a group with the team, or one person). Free, arrives
 *   as a phone notification.
 * - Webhook: REPORT_WEBHOOK_URL gets the report as JSON (to forward to e-mail, a WhatsApp provider, Make/Zapier…).
 * The message carries the client's name, phone and address: the same data the team sees behind the /interno password,
 * sent to the team's own chat. Nothing is written to the server log but the outcome.
 */
import "server-only"
import { SITE_URL } from "../site"

export type ReportAlert = {
  id: string
  code: string
  category: string
  priority: string
  name: string
  phone: string
  address: string
  description: string
  /** The client in Clientes when the phone matched one, and its location. */
  clientName: string
  siteName: string
  /** Other open reports of the same location in the last 24 h (a possible general outage). */
  sameSite: number
}

export const alertChannels = () => ({
  telegram: Boolean(process.env.REPORT_TELEGRAM_BOT_TOKEN && process.env.REPORT_TELEGRAM_CHAT_ID),
  webhook: Boolean(process.env.REPORT_WEBHOOK_URL),
})

const CATEGORY: Record<string, string> = {
  "sin-servicio": "No tiene internet",
  lento: "Internet lento",
  intermitente: "Se corta / va y viene",
  wifi: "Wi-Fi",
  tv: "TV",
  equipo: "Módem u otro equipo",
  otro: "Otra cosa",
}

export const reportLink = (id: string) => `${SITE_URL}/es/interno/admin/reportes_clientes?r=${encodeURIComponent(id)}`

/** The message as plain text (no Markdown: names and descriptions would need escaping). */
export function alertText(a: ReportAlert): string {
  const lines = [
    `${a.priority === "alta" || a.priority === "urgente" ? "🔴" : "🟡"} Nuevo reporte ${a.code} desde la web`,
    `${CATEGORY[a.category] ?? a.category}`,
    "",
    `${a.name} · ${a.phone}`,
    a.address,
    a.clientName ? `Cliente: ${a.clientName}${a.siteName ? ` (${a.siteName})` : ""}` : "No se encontró el cliente por su teléfono",
    a.sameSite > 0 ? `⚠ ${a.sameSite} reporte(s) más abiertos de ${a.siteName || "ese despliegue"} en 24 h: posible falla general` : "",
    a.description ? `\n${a.description}` : "",
    "",
    reportLink(a.id),
  ]
  return lines.filter((l, i) => l !== "" || (i > 0 && lines[i - 1] !== "")).join("\n").slice(0, 4000)
}

async function post(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) })
  return res.ok
}

/** Any other message to the same channels (the daily summary): plain text, and `type` + `data` for the webhook. */
export async function sendText(type: string, text: string, data: unknown = null): Promise<{ telegram: boolean | null; webhook: boolean | null }> {
  const token = process.env.REPORT_TELEGRAM_BOT_TOKEN
  const chat = process.env.REPORT_TELEGRAM_CHAT_ID
  const hook = process.env.REPORT_WEBHOOK_URL
  const [telegram, webhook] = await Promise.all([
    token && chat ? post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }).catch(() => false) : Promise.resolve(null),
    hook ? post(hook, { type, text, data }).catch(() => false) : Promise.resolve(null),
  ])
  if (telegram === false || webhook === false) console.error(`[${type}] send failed: telegram=${telegram} webhook=${webhook}`)
  return { telegram, webhook }
}

/** Sends to every configured channel; returns which ones worked (for the test button and the log). */
export async function sendAlert(a: ReportAlert, text = alertText(a)): Promise<{ telegram: boolean | null; webhook: boolean | null }> {
  const token = process.env.REPORT_TELEGRAM_BOT_TOKEN
  const chat = process.env.REPORT_TELEGRAM_CHAT_ID
  const hook = process.env.REPORT_WEBHOOK_URL
  const [telegram, webhook] = await Promise.all([
    token && chat ? post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chat, text, disable_web_page_preview: true }).catch(() => false) : Promise.resolve(null),
    hook ? post(hook, { type: "reporte", text, report: { ...a, link: reportLink(a.id) } }).catch(() => false) : Promise.resolve(null),
  ])
  if (telegram === false || webhook === false) console.error(`[report] alert failed: telegram=${telegram} webhook=${webhook}`)
  return { telegram, webhook }
}
