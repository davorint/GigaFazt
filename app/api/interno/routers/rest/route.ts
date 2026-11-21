import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { INTERNAL_HEADERS } from "@/lib/internal-pages"
import { REST_ACTIONS, RestError, backupNow, backupText, backupsOf, clientLive, credKeySet, liveView, restAct, restViews, saveRest, testRouter, type RestAction } from "@/lib/wispdavor/rest-server"

const ID = /^[\w-]{6,64}$/
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined)

/**
 * The routers' staff connection, REST or MikroTik API per router (WispDavor → Routers / En vivo). GET: the settings of every router (never
 * passwords) and whether ROUTER_CRED_KEY is set; GET ?respaldo=<id>: one config backup as a text file. POST {action, id,
 * …}: save | test | live | client | act | backup | backups. Signed in only; read-only rules in lib/wispdavor/rest.ts.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = request.nextUrl.searchParams.get("respaldo")
  if (b) {
    if (!/^\d{1,18}$/.test(b)) return json({ error: "not-found" }, 404)
    const f = await backupText(b)
    if (!f) return json({ error: "not-found" }, 404)
    return new Response(f.text, { headers: { ...INTERNAL_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${f.routerId}-${f.createdAt.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.rsc"` } })
  }
  return json({ ok: true, keySet: credKeySet(), rest: await restViews() })
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = text(b.id, 64) ?? ""
  if (!ID.test(id)) return json({ error: "bad-id" }, 400)
  const by = await editorOf(request)
  try {
    switch (b.action) {
      case "save": {
        const err = await saveRest(
          id,
          {
            protocol: text(b.protocol, 10),
            host: text(b.host, 253),
            port: typeof b.port === "number" ? b.port : undefined,
            apiPort: typeof b.apiPort === "number" ? b.apiPort : undefined,
            readUser: text(b.readUser, 64),
            readPass: text(b.readPass, 128),
            writeUser: text(b.writeUser, 64),
            writePass: text(b.writePass, 128),
            clearWrite: b.clearWrite === true,
            fingerprint: text(b.fingerprint, 200),
            readOnly: typeof b.readOnly === "boolean" ? b.readOnly : undefined,
          },
          by
        )
        return err ? json({ error: err }, 400) : json({ ok: true, rest: (await restViews())[id] })
      }
      case "test": {
        return json({ ok: true, ...(await testRouter(id)) })
      }
      case "live":
        return json({ ok: true, live: await liveView(id) })
      case "client":
        return json({ ok: true, client: await clientLive(id, text(b.user, 64) ?? "") })
      case "act": {
        const act = REST_ACTIONS.find((a) => a === b.act) as RestAction | undefined
        if (!act) return json({ error: "bad-action" }, 400)
        return json({ ok: true, done: await restAct(id, act, text(b.user, 64) ?? "", text(b.arg, 64) ?? "", by) })
      }
      case "backup":
        return json({ ok: true, backup: await backupNow(id, by) })
      case "backups":
        return json({ ok: true, backups: (await backupsOf(id)).map((x) => ({ id: String(x.id), at: x.created_at.toISOString(), by: x.created_by, size: Number(x.size) })) })
      default:
        return json({ error: "bad-action" }, 400)
    }
  } catch (e) {
    // The router's answer as a code the page explains (read-only, auth, cert, unreachable…).
    if (e instanceof RestError) return json({ error: e.code, detail: e.message === e.code ? "" : e.message }, e.code === "read-only" || e.code === "no-write-user" ? 403 : 502)
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
