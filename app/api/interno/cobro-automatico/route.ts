import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json } from "@/lib/internal-api"
import { runAutopay, stripeConfigured } from "@/lib/wispdavor/stripe-server"

/**
 * GET /api/interno/cobro-automatico: card auto-pay on its own (the daily cron runs it inside /api/interno/wispdavor-diario),
 * allowed with `Authorization: Bearer <CRON_SECRET>`. Charges only on days 1, 5 and 9 (lib/wispdavor/online.ts).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401)
  if (!stripeConfigured() || !hasDatabase()) return json({ ok: false, error: "not-configured" }, 409)
  try {
    return json({ ok: true, ...(await runAutopay()) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
