import { hasDatabase } from "@/lib/db/client"
import { parsePartHeader } from "@/lib/wispdavor/backups"
import { receivePart } from "@/lib/wispdavor/backups-server"
import { routerForAuth } from "@/lib/wispdavor/routers-server"

const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
/** A piece is at most 30000 bytes of the export (lib/wispdavor/backups.ts BACKUP_CHUNK); a little room on top. */
const MAX_BODY = 64 * 1024

/**
 * POST /api/routers/respaldo: a piece of a router's configuration (phase 7), sent by its agent while doing a "backup"
 * action. Authorization: Bearer <router id>.<key> (like /api/routers/agente); X-WD-Backup: <action id>/<piece>/<pieces>;
 * body = the piece. When the last piece is in, the copy is kept (lib/wispdavor/backups-server.ts).
 */
export async function POST(request: Request) {
  if (!hasDatabase()) return new Response("", { status: 503, headers: TEXT })
  const router = await routerForAuth(request.headers.get("authorization") ?? "").catch(() => null)
  if (!router) return new Response("", { status: 401, headers: TEXT })
  const part = parsePartHeader(request.headers.get("x-wd-backup") ?? "")
  if (!part) return new Response("", { status: 400, headers: TEXT })
  const body = await request.text()
  if (body.length > MAX_BODY) return new Response("", { status: 413, headers: TEXT })
  try {
    const r = await receivePart(router.id, part, body)
    return new Response(r === "partial" ? "partial" : r.kind, { headers: TEXT })
  } catch (e) {
    console.error("[routers] backup piece failed", e instanceof Error ? e.message.slice(0, 200) : "")
    return new Response("", { status: 500, headers: TEXT })
  }
}
