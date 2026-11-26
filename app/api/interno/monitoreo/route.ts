import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { monitorView } from "@/lib/wispdavor/monitor-server"
import { getSaver } from "@/lib/interno/saver-server"

/**
 * Monitoring for staff (WispDavor → Monitoreo, phase 4): routers with their last day of sessions online and carrier
 * pings, the ONTs worth a look, and the outages of the last 30 days. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    // `saver`: the team's "sincronización automática" switch is off, so the page stops refreshing itself.
    const [view, saver] = await Promise.all([monitorView(), getSaver()])
    return json({ ok: true, ...view, saver: saver.on })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
