import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { canChangeRouters, editorOf, json, requireInterno } from "@/lib/internal-api"
import { addPeer, getTunnel, peers, removePeer, saveTunnel, setPeerKey, routeThroughTunnel, vpsSetup } from "@/lib/wispdavor/tunnel-server"

const ID = /^[\w-]{1,64}$/

/**
 * The WireGuard tunnel (phase 11). GET: the server's settings, every router with its place in the tunnel, and the
 * server's setup script. POST {action}: settings | add | key | remove | use (admins only: it opens a way into the
 * routers).
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  return json({ ok: true, settings: await getTunnel(), peers: await peers(), vps: await vpsSetup(), canChange: await canChangeRouters(request) })
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (!(await canChangeRouters(request))) return json({ error: "admin-only" }, 403)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const by = await editorOf(request)
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : ""
  switch (b.action) {
    case "settings":
      return json({ ok: true, settings: await saveTunnel(b.settings, by) })
    case "add": {
      if (!id) return json({ error: "bad-id" }, 400)
      const r = await addPeer(id, by)
      return typeof r === "string" ? json({ error: r }, r === "full" ? 409 : 404) : json({ ok: true, ...r })
    }
    case "key":
      return (await setPeerKey(id, typeof b.key === "string" ? b.key : "", by)) ? json({ ok: true }) : json({ error: "bad-key" }, 400)
    case "remove":
      if (!id) return json({ error: "bad-id" }, 400)
      // Pointed at the VPS: back to its own ports first (a host typed by hand stays as it is).
      if ((await peers()).find((p) => p.routerId === id)?.usingTunnel) await routeThroughTunnel(id, false, by)
      await removePeer(id)
      return json({ ok: true })
    case "use": {
      const r = await routeThroughTunnel(id, b.on === true, by)
      return r === "ok" ? json({ ok: true }) : json({ error: r }, 409)
    }
    default:
      return json({ error: "bad-action" }, 400)
  }
}
