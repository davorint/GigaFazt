import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, editorOf, json, requireInterno } from "@/lib/internal-api"
import { kindAllowed, kindWritable } from "@/lib/team/roles"
import { MAX_BODY_BYTES, MAX_CHANGES, SYNC_KINDS, type Change, type SyncKind } from "@/lib/sync/protocol"
import { sync } from "@/lib/sync/server"

/**
 * POST /api/interno/sync: a phone's changes to one kind of record (surveys, materials or providers) in, everything
 * changed since its last sync out (lib/sync/protocol.ts). Signed in only; the editor's name comes from the
 * `x-interno-nombre` header.
 */
export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too-large" }, 413)
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return json({ error: "too-large" }, 413)
    body = JSON.parse(text)
  } catch {
    return json({ error: "bad-json" }, 400)
  }
  const b = body as { kind?: unknown; since?: unknown; changes?: unknown }
  if (!SYNC_KINDS.includes(b.kind as SyncKind)) return json({ error: "bad-kind" }, 400)
  // Phase 14: a role only syncs its kinds of records (the phone skips the others quietly).
  const access = await accessOf(request)
  if (access && !kindAllowed(access, b.kind as SyncKind)) return json({ error: "forbidden-kind" }, 403)
  const since = typeof b.since === "number" && Number.isFinite(b.since) && b.since >= 0 ? Math.floor(b.since) : 0
  if (!Array.isArray(b.changes) || b.changes.length > MAX_CHANGES) return json({ error: "bad-changes" }, 400)
  const changes: Change[] = []
  for (const x of b.changes as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || typeof x.editedAt !== "string") return json({ error: "bad-change" }, 400)
    changes.push({
      id: x.id,
      baseVersion: typeof x.baseVersion === "number" && Number.isInteger(x.baseVersion) ? x.baseVersion : null,
      data: x.data ?? null,
      deleted: x.deleted === true,
      editedAt: x.editedAt,
    })
  }
  // A kind this role only reads: its changes are refused one by one (the phone shows them), the records still come.
  if (access && changes.length && !kindWritable(access, b.kind as SyncKind)) {
    try {
      const r = await sync(b.kind as SyncKind, since, [], await editorOf(request))
      return json({ ...r, results: changes.map((c) => ({ id: c.id, outcome: "rejected" as const, reason: "solo-lectura" })) })
    } catch (e) {
      return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
    }
  }
  try {
    return json(await sync(b.kind as SyncKind, since, changes, await editorOf(request)))
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
