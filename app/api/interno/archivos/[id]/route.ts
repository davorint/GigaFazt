import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { readFile, removeFile } from "@/lib/contracts/storage"
import { json, requireInterno } from "@/lib/internal-api"
import { INTERNAL_HEADERS } from "@/lib/internal-pages"

const ID = /^[\w-]{6,64}$/

/**
 * GET /api/interno/archivos/<id>: a contract's signed copy, shown in the browser (?descargar=1 saves it instead).
 * DELETE /api/interno/archivos/<id>: takes it out (marked deleted in the table, not erased).
 * Signed in only; never cached.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/interno/archivos/[id]">) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const { id } = await params
  if (!ID.test(id)) return json({ error: "not-found" }, 404)
  try {
    const f = await readFile(id)
    if (!f) return json({ error: "not-found" }, 404)
    const how = request.nextUrl.searchParams.get("descargar") ? "attachment" : "inline"
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")
    return new Response(f.body, {
      headers: {
        ...INTERNAL_HEADERS,
        "Content-Type": f.mime,
        "Content-Length": String(f.size),
        "Content-Disposition": `${how}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext<"/api/interno/archivos/[id]">) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const { id } = await params
  if (!ID.test(id)) return json({ error: "not-found" }, 404)
  try {
    await removeFile(id)
    return json({ ok: true })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
