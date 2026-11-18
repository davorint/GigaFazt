import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { SYNC_KINDS, type SyncKind } from "@/lib/sync/protocol"
import { deletedOf, versionsOf } from "@/lib/sync/history"

/**
 * GET /api/interno/historial?kind=<kind>&id=<id>: the saved versions of one record, newest first.
 * GET /api/interno/historial?kind=<kind>&borrados=1: the records of that kind deleted in the last 90 days.
 * Signed in only (lib/sync/history.ts).
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const p = request.nextUrl.searchParams
  const kind = p.get("kind") as SyncKind
  if (!SYNC_KINDS.includes(kind)) return json({ error: "bad-kind" }, 400)
  try {
    if (p.get("borrados")) return json({ ok: true, deleted: await deletedOf(kind) })
    const id = p.get("id") ?? ""
    return json({ ok: true, versions: await versionsOf(kind, id) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
