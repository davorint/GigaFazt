import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { requireArea, requireInterno } from "@/lib/internal-api"
import { INTERNAL_HEADERS } from "@/lib/internal-pages"
import { fullBackup } from "@/lib/sync/history"

/**
 * GET /api/interno/respaldo: everything in the database as one JSON file to keep (clients, payments, reports,
 * deployments, tools, providers, materials, stock, surveys, notes, saved MikroTik deployments, website leads).
 * Signed in only; it holds personal data, so it's never cached.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const forbidden = await requireArea(request, "backup")
  if (forbidden) return forbidden
  if (!hasDatabase()) return Response.json({ error: "no-database" }, { status: 503, headers: INTERNAL_HEADERS })
  try {
    const body = JSON.stringify(await fullBackup(), null, 1)
    const day = new Date().toISOString().slice(0, 10)
    return new Response(body, {
      headers: { ...INTERNAL_HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="gigafazt-respaldo-${day}.json"` },
    })
  } catch (e) {
    return Response.json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, { status: 500, headers: INTERNAL_HEADERS })
  }
}
