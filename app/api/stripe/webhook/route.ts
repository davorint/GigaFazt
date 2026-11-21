import { NextResponse } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { handleEvent, stripe, stripeConfigured, webhookConfigured } from "@/lib/wispdavor/stripe-server"

/**
 * POST /api/stripe/webhook: Stripe's events for WispDavor's online payments (lib/wispdavor/stripe-server.ts). Only
 * requests signed with STRIPE_WEBHOOK_SECRET are read (Stripe-Signature header, raw body). Events to subscribe:
 * checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
 * checkout.session.expired, payment_intent.succeeded, payment_intent.payment_failed.
 */
export async function POST(request: Request) {
  if (!stripeConfigured() || !webhookConfigured() || !hasDatabase()) return NextResponse.json({ error: "not-configured" }, { status: 503 })
  const raw = await request.text()
  let event
  try {
    event = stripe().webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET as string)
  } catch {
    return NextResponse.json({ error: "signature" }, { status: 400 })
  }
  try {
    await handleEvent(event)
    return NextResponse.json({ received: true })
  } catch (e) {
    // 500 → Stripe retries the event later; every step is safe to repeat.
    console.error("[stripe] webhook failed", event.type, e instanceof Error ? e.message.slice(0, 200) : "")
    return NextResponse.json({ error: "server" }, { status: 500 })
  }
}
