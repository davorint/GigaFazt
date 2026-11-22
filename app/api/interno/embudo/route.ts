import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireArea, requireInterno } from "@/lib/internal-api"
import { funnelEvents } from "@/lib/wispdavor/funnel-server"

/**
 * GET /api/interno/embudo?desde=YYYY-MM-DD: the notice and suspension days per client since then, for the collections
 * funnel (WispDavor → Cobranza, phase 6). The funnel itself is computed on the phone from Clientes and Cobranza.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const forbidden = await requireArea(request, "payments")
  if (forbidden) return forbidden
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const since = request.nextUrl.searchParams.get("desde") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return json({ error: "bad-date" }, 400)
  try {
    return json({ ok: true, events: await funnelEvents(since) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
