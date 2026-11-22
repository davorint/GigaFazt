import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, editorOf, json, requireInterno } from "@/lib/internal-api"
import { getTemplate, saveTemplate } from "@/lib/wispdavor/contrato-server"

/** The client contract's text (phase 15). GET: the current version. POST {title, body}: saves it (admins only). */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  return json({ ok: true, template: await getTemplate(), canEdit: !!(await accessOf(request))?.admin })
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (!(await accessOf(request))?.admin) return json({ error: "admin-only" }, 403)
  const b = (await request.json().catch(() => ({}))) as { title?: unknown; body?: unknown }
  if (typeof b.title !== "string" || typeof b.body !== "string" || !b.title.trim() || !b.body.trim()) return json({ error: "empty" }, 400)
  return json({ ok: true, template: await saveTemplate(b.title, b.body, await editorOf(request)) })
}
