import { hasDatabase } from "@/lib/db/client"
import { agentVisit, routerForAuth } from "@/lib/wispdavor/routers-server"

const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
/** A router's report is small (one line per PPPoE user); more than this isn't one of ours. */
const MAX_BODY = 512 * 1024

/**
 * POST /api/routers/agente: a MikroTik's visit (the WispDavor agent script, every 2 minutes). Authorization: Bearer
 * <router id>.<key>; body = its report; answer = its next actions, one per line (lib/wispdavor/routers.ts).
 */
export async function POST(request: Request) {
  if (!hasDatabase()) return new Response("", { status: 503, headers: TEXT })
  const router = await routerForAuth(request.headers.get("authorization") ?? "").catch(() => null)
  if (!router) return new Response("", { status: 401, headers: TEXT })
  const body = await request.text()
  if (body.length > MAX_BODY) return new Response("", { status: 413, headers: TEXT })
  try {
    return new Response(await agentVisit(router, body), { headers: TEXT })
  } catch (e) {
    console.error("[routers] agent visit failed", e instanceof Error ? e.message.slice(0, 200) : "")
    return new Response("", { status: 500, headers: TEXT })
  }
}
