import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireArea, requireInterno } from "@/lib/internal-api"
import { activity } from "@/lib/team/activity-server"

/** GET /api/interno/actividad?dias=7&quien=&tipo=: the activity log (phase 14), admins only. */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const forbidden = await requireArea(request, "activity")
  if (forbidden) return forbidden
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const q = request.nextUrl.searchParams
  try {
    return json({ ok: true, ...(await activity({ days: Number(q.get("dias") ?? 7), who: (q.get("quien") ?? "").slice(0, 60), kind: (q.get("tipo") ?? "").slice(0, 20) })) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
