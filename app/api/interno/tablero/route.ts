import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, json, requireInterno } from "@/lib/internal-api"
import { networkFigures } from "@/lib/interno/dashboard-server"

/** GET /api/interno/tablero: the network figures for the Tablero (Oficina and admins, like the page). */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const a = await accessOf(request)
  if (!a || !(a.admin || a.role === "oficina")) return json({ error: "forbidden" }, 403)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ ok: true, network: await networkFigures() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
