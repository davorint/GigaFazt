import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, json, requireInterno } from "@/lib/internal-api"
import { liveFigures } from "@/lib/interno/tablero2-live-server"

/** GET /api/interno/tablero2/vivo: La red viva's minute (routers, sessions online, traffic now, open failures); Oficina and admins. */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const a = await accessOf(request)
  if (!a || !(a.admin || a.role === "oficina")) return json({ error: "forbidden" }, 403)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ ok: true, live: await liveFigures() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
