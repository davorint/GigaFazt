import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { accessOf, json, requireInterno } from "@/lib/internal-api"
import { kindAllowed } from "@/lib/team/roles"
import { SYNC_KINDS } from "@/lib/sync/protocol"
import { latestRevs } from "@/lib/sync/server"

/**
 * GET /api/interno/sync/revs: the latest revision of every kind this person can sync, in one request. The phones
 * check it every minute and only sync the kinds that moved (one request per kind every 30 s used up the plan's
 * function invocations). Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const access = await accessOf(request)
  const kinds = SYNC_KINDS.filter((k) => !access || kindAllowed(access, k))
  try {
    return json({ revs: await latestRevs(kinds) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
