import type { NextRequest } from "next/server"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { alertChannels, sendAlert } from "@/lib/reports/notify"

/**
 * Alerts for reports from the public form (lib/reports/notify.ts). Signed in only.
 * GET: which channels are set up on the host (yes/no, never the values).
 * POST: sends a test alert to every channel and says which ones answered.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  return json({ ok: true, ...alertChannels() })
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const ch = alertChannels()
  if (!ch.telegram && !ch.webhook) return json({ ok: false, error: "not-configured" }, 409)
  const by = await editorOf(request)
  const sent = await sendAlert(
    { id: "prueba", code: "R-PRUEBA", category: "otro", priority: "normal", name: "Prueba", phone: "", address: "", description: "", clientName: "", siteName: "", sameSite: 0 },
    `✅ Prueba de avisos de reportes de GigaFazt${by ? ` (la envió ${by})` : ""}. Si ves esto, los reportes de la web llegarán aquí.`
  )
  return json({ ok: sent.telegram !== false && sent.webhook !== false, ...sent })
}
