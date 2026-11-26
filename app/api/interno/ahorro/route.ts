import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, editorOf, json, requireInterno } from "@/lib/internal-api"
import { getSaver, setSaver } from "@/lib/interno/saver-server"

/**
 * The team-wide "sincronización automática" switch (lib/interno/saver-server.ts). GET: whether saving mode is on.
 * POST { on }: admins only (it changes how every phone syncs).
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ saver: await getSaver() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const access = await accessOf(request)
  if (!access?.admin) return json({ error: "admin-only" }, 403)
  let body: { on?: unknown }
  try {
    body = (await request.json()) as { on?: unknown }
  } catch {
    return json({ error: "bad-json" }, 400)
  }
  if (typeof body.on !== "boolean") return json({ error: "bad-on" }, 400)
  try {
    return json({ saver: await setSaver(body.on, await editorOf(request)) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
