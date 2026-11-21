import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { bearerAuthorized, json } from "@/lib/internal-api"
import { sweepSilent } from "@/lib/wispdavor/monitor-server"

/**
 * GET /api/interno/vigia: the watchdog for silent routers (owner, 2026-11-21). An outside pinger (e.g. cron-job.org)
 * calls it every 5 minutes with `Authorization: Bearer <VIGIA_SECRET>`: a router that stopped reporting opens an
 * outage and the team is alerted, even when it's the only router (the host's own crons run once a day). Its own secret,
 * not CRON_SECRET: this one is shared with an outside service and can only run this check.
 */
export async function GET(request: NextRequest) {
  if (!bearerAuthorized(request, process.env.VIGIA_SECRET)) return json({ error: "unauthorized" }, 401)
  if (!hasDatabase()) return json({ ok: false, error: "no-database" }, 409)
  try {
    return json({ ok: true, opened: await sweepSilent() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
