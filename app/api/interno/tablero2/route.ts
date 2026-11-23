import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, json, requireInterno } from "@/lib/internal-api"
import { carrierFigures } from "@/lib/interno/tablero2-server"

/** GET /api/interno/tablero2: carriers, continuity, packet path and daily busy hours for Tablero 2 (Oficina and admins). */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const a = await accessOf(request)
  if (!a || !(a.admin || a.role === "oficina")) return json({ error: "forbidden" }, 403)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ ok: true, carriers: await carrierFigures() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
