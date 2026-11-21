import type { NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { SITE_URL, SITE_URL_CONFIGURED } from "@/lib/site"
import { agentScript, randomCode, safe } from "@/lib/wispdavor/routers"
import { createRouter, deleteRouter, listRouters, queueAction, queueDiffs, rotateKey, routerDiff, updateRouter } from "@/lib/wispdavor/routers-server"

const ID = /^[\w-]{6,64}$/
const fail = (e: unknown) => json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 300) : "error" }, 500)
const agentUrl = (request: NextRequest) => `${SITE_URL_CONFIGURED ? SITE_URL : new URL(request.url).origin}/api/routers/agente`

/**
 * Routers for staff (WispDavor → Routers). GET: every router with its differences (to send), users to create and its
 * last 40 actions. POST {action}: create (answers the key and the script once), rotate (new key + script), update
 * (name, roles, deployment, automatic switch), delete, send (queue the differences now), createUser (a missing PPPoE user
 * with a new password, shown once). Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    // ?basico=1: just the routers (deployment, roles, automatic, online), for Cortes and others; no differences computed.
    if (request.nextUrl.searchParams.get("basico")) {
      const now = Date.now()
      return json({ ok: true, routers: (await listRouters()).map((r) => ({ ...r, online: !!r.lastSeenAt && now - Date.parse(r.lastSeenAt) < 6 * 60 * 1000 })) })
    }
    const pool = getPool()
    const out = []
    for (const r of await listRouters()) {
      const diff = await routerDiff(r)
      const actions = (await pool.query(`select id, kind, "user", arg1, source, status, result, created_at, created_by, done_at from router_actions where router_id = $1 order by id desc limit 40`, [r.id])).rows
      const users = Number(((await pool.query(`select count(*) from router_users where router_id = $1`, [r.id])).rows[0] as { count: string }).count)
      // Online: reported within the last 3 polls (POLL_MINUTES = 2).
      const online = !!r.lastSeenAt && Date.now() - Date.parse(r.lastSeenAt) < 6 * 60 * 1000
      out.push({ ...r, online, users, changes: diff.changes, missing: diff.missing, unmanaged: diff.unmanaged, actions })
    }
    return json({ ok: true, routers: out })
  } catch (e) {
    return fail(e)
  }
}

type Body = { action?: unknown; id?: unknown; siteId?: unknown; name?: unknown; pppoe?: unknown; hotspot?: unknown; auto?: unknown; user?: unknown; profile?: unknown; clientId?: unknown; serviceId?: unknown }
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as Body
  const by = await editorOf(request)
  const id = text(b.id, 64)
  try {
    if (b.action === "create") {
      const name = text(b.name, 60)
      if (!name) return json({ error: "name" }, 400)
      const { router, key } = await createRouter({ siteId: text(b.siteId, 64), name, pppoe: b.pppoe !== false, hotspot: b.hotspot === true }, by)
      return json({ ok: true, router, script: agentScript({ url: agentUrl(request), routerId: router.id, key }) })
    }
    if (!ID.test(id)) return json({ error: "bad-id" }, 400)
    if (b.action === "rotate") return json({ ok: true, script: agentScript({ url: agentUrl(request), routerId: id, key: await rotateKey(id) }) })
    if (b.action === "update") {
      await updateRouter(id, {
        ...(typeof b.name === "string" ? { name: text(b.name, 60) } : {}),
        ...(typeof b.auto === "boolean" ? { auto: b.auto } : {}),
        ...(typeof b.pppoe === "boolean" ? { pppoe: b.pppoe } : {}),
        ...(typeof b.hotspot === "boolean" ? { hotspot: b.hotspot } : {}),
        ...(typeof b.siteId === "string" ? { siteId: text(b.siteId, 64) } : {}),
      })
      return json({ ok: true })
    }
    if (b.action === "delete") {
      await deleteRouter(id)
      return json({ ok: true })
    }
    const router = (await listRouters()).find((r) => r.id === id)
    if (!router) return json({ error: "not-found" }, 404)
    if (b.action === "send") {
      const { changes } = await routerDiff(router)
      return json({ ok: true, queued: await queueDiffs(id, changes, "staff", by) })
    }
    if (b.action === "createUser") {
      const user = text(b.user, 64)
      const profile = text(b.profile, 64)
      if (!safe(user) || !safe(profile)) return json({ error: "bad-user" }, 400)
      // The password goes to the router and to the ONT: shown once here, wiped from the action once the router has it.
      const password = randomCode(12)
      await queueAction(id, { kind: "create", user, arg1: profile, arg2: password, arg3: "", arg4: "" }, { clientId: text(b.clientId, 64), serviceId: text(b.serviceId, 64), by })
      return json({ ok: true, user, password })
    }
    return json({ error: "bad-action" }, 400)
  } catch (e) {
    return fail(e)
  }
}
