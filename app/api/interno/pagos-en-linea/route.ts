import type { NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { stopAutopay, stripeConfigured, webhookConfigured } from "@/lib/wispdavor/stripe-server"

const ID = /^[\w-]{6,64}$/

/**
 * Online payments for staff (WispDavor → Pagos). GET: whether Stripe is set up, the last 300 online payments and the
 * auto-pay clients. POST {clientId}: stops a client's auto-pay. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const configured = { stripe: stripeConfigured(), webhook: webhookConfigured(), cron: Boolean(process.env.CRON_SECRET), testMode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_") }
  if (!hasDatabase()) return json({ ok: true, configured, payments: [], autopay: [] })
  try {
    const pool = getPool()
    const payments = (await pool.query(`select id, client_id, kind, amount, status, payment_id, error, created_at, paid_at from online_payments order by created_at desc limit 300`)).rows
    const autopay = (await pool.query(`select client_id, card_brand, card_last4, updated_at from stripe_customers where autopay order by updated_at desc`)).rows
    return json({ ok: true, configured, payments, autopay })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as { clientId?: unknown }
  const clientId = typeof b.clientId === "string" ? b.clientId : ""
  if (!ID.test(clientId)) return json({ error: "bad-client" }, 400)
  try {
    await stopAutopay(clientId)
    return json({ ok: true })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
