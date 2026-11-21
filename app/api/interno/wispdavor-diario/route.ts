import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { cronAuthorized, json } from "@/lib/internal-api"
import { trafficRetention } from "@/lib/wispdavor/routers-server"
import { runAutopay, stripeConfigured } from "@/lib/wispdavor/stripe-server"

/**
 * GET /api/interno/wispdavor-diario: WispDavor's daily run (vercel.json cron, 15:00 UTC = 9:00 in Mexico City; one
 * cron for all of WispDavor), allowed with `Authorization: Bearer <CRON_SECRET>`: card auto-pay (charges only on days 1,
 * 5 and 9, when Stripe is set up), then traffic retention (5-minute → hourly after 7 days, hourly kept 90 days) and old
 * router actions removed. Each part runs even if the other fails.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401)
  if (!hasDatabase()) return json({ ok: false, error: "no-database" }, 409)
  const part = async <T,>(f: () => Promise<T>) => {
    try {
      return { ok: true, ...(await f()) }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }
    }
  }
  const autopay = stripeConfigured() ? await part(() => runAutopay()) : { ok: false, detail: "sin Stripe" }
  const retention = await part(() => trafficRetention())
  return json({ ok: true, autopay, retention })
}
