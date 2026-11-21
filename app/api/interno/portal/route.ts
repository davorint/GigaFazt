import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { createLink, listLinks, revokeLinks } from "@/lib/wispdavor/portal-server"

const ID = /^[\w-]{6,64}$/
const fail = (e: unknown) => json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)

/**
 * The clients' portal links (WispDavor → Portal). GET: every link. POST {clientId}: revokes the client's links and makes
 * a new one (one valid link per client). DELETE ?cliente=<id>: revokes them. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ ok: true, links: await listLinks() })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const body = (await request.json().catch(() => ({}))) as { clientId?: unknown }
  const clientId = typeof body.clientId === "string" ? body.clientId : ""
  if (!ID.test(clientId)) return json({ error: "bad-client" }, 400)
  try {
    await revokeLinks(clientId)
    return json({ ok: true, link: await createLink(clientId, await editorOf(request)) })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const clientId = request.nextUrl.searchParams.get("cliente") ?? ""
  if (!ID.test(clientId)) return json({ error: "bad-client" }, 400)
  try {
    return json({ ok: true, revoked: await revokeLinks(clientId) })
  } catch (e) {
    return fail(e)
  }
}
