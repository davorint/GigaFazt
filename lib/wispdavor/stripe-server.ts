/**
 * Stripe for WispDavor (owner, 2026-11-21: card, OXXO, SPEI and card auto-pay). Keys only on the host:
 * STRIPE_SECRET_KEY (sk_test_… while testing) and STRIPE_WEBHOOK_SECRET (whsec_…, the endpoint /api/stripe/webhook).
 *
 * - Checkout (Stripe's hosted page) per payment, the method chosen with allowed_payment_method_types (this API version's
 *   filter; the methods must be enabled in the Dashboard): card (optionally saved for auto-pay: setup_future_usage off_session),
 *   OXXO (voucher valid OXXO_DAYS days; asynchronous) or SPEI (`customer_balance` + `mx_bank_transfer`: each customer
 *   gets a reusable CLABE; asynchronous). Docs: docs.stripe.com/payments/oxxo, /payments/bank-transfers,
 *   /payments/checkout/save-during-payment.
 * - The webhook turns a paid payment into a Cobranza payment once (online_payments row locked), saves the card when
 *   auto-pay was chosen, tells the client by WhatsApp (reconnection if they were suspended) and alerts the team.
 * - Auto-pay: on days 1, 5 and 9, the owed amount is charged off-session to the saved card; a decline messages the
 *   client. Server code only.
 */
import "server-only"
import Stripe from "stripe"
import type { Client } from "../clients/model"
import { getPool } from "../db/client"
import { todayInMexico } from "../lead"
import { mxn } from "../materials/catalog"
import { ledger } from "../payments/model"
import { sendText } from "../reports/notify"
import { addPayment, loadClient, loadPayments, portalAddress } from "./db-server"
import { OXXO_DAYS, amountToCharge, centavos, cobranzaMethod, isAutopayDay, methodsFor, type PayKind } from "./online"
import { desiredUsers } from "./routers"
import { waNumber, type TemplateId } from "./whatsapp"
import { sendTemplate, whatsappConfigured } from "./whatsapp-server"

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim())
export const webhookConfigured = () => Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())

let client: Stripe | null = null
/** The API version is the one this SDK version pins (stripe@23.1.0: 2026-10-28.endive). */
export const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY as string))

const EDITOR = "Pago en línea"

/** The client's Stripe customer, created the first time (it keeps their SPEI CLABE and saved card). */
async function customerFor(c: Client): Promise<string> {
  const pool = getPool()
  const row = (await pool.query(`select customer_id from stripe_customers where client_id = $1`, [c.id])).rows[0] as { customer_id: string } | undefined
  if (row) return row.customer_id
  // A malformed email would make Stripe refuse the customer (and the client's payment): only a valid one is sent.
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()) ? c.email.trim() : undefined
  const cu = await stripe().customers.create({ name: c.name || undefined, email, metadata: { client_id: c.id } }, { idempotencyKey: `customer-${c.id}` })
  await pool.query(`insert into stripe_customers (client_id, customer_id) values ($1, $2) on conflict (client_id) do nothing`, [c.id, cu.id])
  return ((await pool.query(`select customer_id from stripe_customers where client_id = $1`, [c.id])).rows[0] as { customer_id: string }).customer_id
}

export type CheckoutResult = { url: string } | { error: "nothing" | "method" }

/** A hosted Checkout for what the client owes (or a month ahead); back to their portal when done. */
export async function startCheckout(c: Client, kind: Exclude<PayKind, "autopay">, saveCard: boolean, portal: string): Promise<CheckoutResult> {
  const amount = amountToCharge(ledger(c, await loadPayments(c.id), todayInMexico()))
  if (amount <= 0) return { error: "nothing" }
  if (!methodsFor(amount).includes(kind)) return { error: "method" }
  const customer = await customerFor(c)
  const meta = { client_id: c.id, kind, autopay: kind === "card" && saveCard ? "1" : "0" }
  const [base, frag] = portal.split("#")
  const back = (state: string) => `${base}?pago=${state}${frag ? `#${frag}` : ""}`
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: c.id,
    locale: "es",
    line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: centavos(amount), product_data: { name: "Servicio de internet GigaFazt" } } }],
    // API 2026-10-28 (this SDK): a filter on the methods enabled in the Dashboard (Settings → Payment methods), which
    // must have card, OXXO and bank transfers on.
    allowed_payment_method_types: kind === "card" ? ["card"] : kind === "oxxo" ? ["oxxo"] : ["customer_balance"],
    ...(kind === "oxxo" ? { payment_method_options: { oxxo: { expires_after_days: OXXO_DAYS } } } : {}),
    ...(kind === "spei" ? { payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } } } } : {}),
    payment_intent_data: { metadata: meta, ...(meta.autopay === "1" ? { setup_future_usage: "off_session" } : {}) },
    metadata: meta,
    success_url: back("ok"),
    cancel_url: back("cancelado"),
  })
  await getPool().query(`insert into online_payments (id, client_id, kind, amount, status) values ($1, $2, $3, $4, 'pending')`, [session.id, c.id, kind, amount])
  if (!session.url) throw new Error("Stripe returned no checkout url")
  return { url: session.url }
}

/** The online payment row as paid → a Cobranza payment (once), the saved card, the client's message, the team's alert. */
async function markPaid(rowId: string, paymentIntentId: string, amountReceived: number | null) {
  const c = await getPool().connect()
  let done: { clientId: string; kind: PayKind; amount: number } | null = null
  try {
    await c.query("begin")
    const row = (await c.query(`select client_id, kind, amount, status from online_payments where id = $1 for update`, [rowId])).rows[0] as
      | { client_id: string; kind: PayKind; amount: number; status: string }
      | undefined
    if (row && row.status !== "paid") {
      const amount = amountReceived ?? row.amount
      // The id comes from Stripe's payment: if this step runs again (a retry after a failure below), it's the same record.
      const pay = await addPayment({ id: `stripe-${paymentIntentId || rowId}`.slice(0, 64), clientId: row.client_id, amount, date: todayInMexico(), method: cobranzaMethod(row.kind), reference: `Stripe ${paymentIntentId}`, notes: EDITOR }, EDITOR)
      await c.query(`update online_payments set status = 'paid', paid_at = now(), payment_intent_id = $2, payment_id = $3, amount = $4 where id = $1`, [rowId, paymentIntentId, pay.id, amount])
      done = { clientId: row.client_id, kind: row.kind, amount }
    }
    await c.query("commit")
  } catch (e) {
    await c.query("rollback").catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
  if (done) await afterPaid(done.clientId, done.kind, done.amount, paymentIntentId)
}

async function afterPaid(clientId: string, kind: PayKind, amount: number, paymentIntentId: string) {
  const cl = await loadClient(clientId)
  // A card saved for auto-pay: keep it (brand, last 4, credit/debit for the CFDI payment form).
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] })
    const pm = typeof pi.payment_method === "object" ? pi.payment_method : null
    if (pm?.card && (pi.metadata?.autopay === "1" || kind === "autopay")) {
      await getPool().query(
        `update stripe_customers set autopay = true, payment_method_id = $2, card_brand = $3, card_last4 = $4, card_funding = $5, updated_at = now() where client_id = $1`,
        [clientId, pm.id, pm.card.brand, pm.card.last4, pm.card.funding]
      )
    }
  } catch {
    // Not saving the card never undoes the payment.
  }
  if (!cl) return
  const wasSuspended = cl.services.some((s) => s.type === "internet" && s.status === "suspendido")
  const back = wasSuspended ? await reconnection(cl) : "no"
  // "Tu servicio ya está activo" only when it really comes back by itself (the deployment's router is on automatic
  // and reporting, and the payment cleared what was late); otherwise the plain receipt, and the team reconnects.
  await message(cl, back === "auto" ? "reconexion" : "pagoRecibido", amount)
  const note = !wasSuspended ? "" : back === "auto" ? " · estaba suspendido: el router lo reconecta solo" : back === "late" ? " · estaba suspendido y sigue con adeudo o en suspensión manual" : " · estaba suspendido: reconectar (WispDavor → Cortes)"
  await sendText("pago", `💳 Pago en línea: ${cl.name || cl.id} · ${mxn(amount)} · ${kind === "spei" ? "SPEI" : kind === "oxxo" ? "OXXO" : kind === "autopay" ? "cobro automático" : "tarjeta"}${note}`).catch(() => undefined)
}

/**
 * After a payment, whether a suspended client comes back: "late" (still owes, or a manual hold), "auto" (its
 * deployment has a router on automatic that reported in the last 6 minutes) or "manual" (staff reconnect).
 */
async function reconnection(cl: Client): Promise<"auto" | "manual" | "late"> {
  const desired = desiredUsers([cl], await loadPayments(cl.id), todayInMexico())
  if (!desired.length) return "manual"
  if (desired.some((d) => d.suspended)) return "late"
  if (!cl.siteId) return "manual"
  const r = await getPool().query(`select 1 from routers where site_id = $1 and auto and pppoe and last_seen_at > now() - interval '6 minutes' limit 1`, [cl.siteId])
  return (r.rowCount ?? 0) > 0 ? "auto" : "manual"
}

async function message(cl: Client, template: TemplateId, amount: number) {
  const to = waNumber(cl.whatsapp || cl.phone)
  if (!to || !whatsappConfigured()) return
  const first = cl.name.trim().split(/\s+/)[0] || "cliente"
  const values = template === "reconexion" ? [first] : [first, mxn(amount), await portalAddress(cl.id)]
  await sendTemplate(to, template, values, { clientId: cl.id, by: EDITOR }).catch(() => undefined)
}

/** True when this call is the one that marked it (so only one message goes to the client). */
async function markFailed(rowId: string, status: "failed" | "expired", error = ""): Promise<boolean> {
  const r = await getPool().query(`update online_payments set status = $2, error = $3 where id = $1 and status not in ('paid', 'failed', 'expired')`, [rowId, status, error.slice(0, 300)])
  return (r.rowCount ?? 0) > 0
}

/** What the webhook does with each event it receives (others are ignored). */
export async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? "")
      if (s.payment_status === "paid") await markPaid(s.id, pi, s.amount_total !== null ? s.amount_total / 100 : null)
      else await getPool().query(`update online_payments set status = 'waiting', payment_intent_id = $2 where id = $1 and status = 'pending'`, [s.id, pi])
      return
    }
    case "checkout.session.async_payment_failed":
      await markFailed(event.data.object.id, "failed")
      return
    case "checkout.session.expired":
      await markFailed(event.data.object.id, "expired")
      return
    case "payment_intent.succeeded": {
      const pi = event.data.object
      if (pi.metadata?.kind === "autopay") await markPaid(pi.id, pi.id, pi.amount_received / 100)
      return
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object
      if (pi.metadata?.kind !== "autopay") return
      // The auto-pay run marks (and messages) its own declines; the webhook only does when it got there first.
      if (!(await markFailed(pi.id, "failed", pi.last_payment_error?.message ?? ""))) return
      const cl = await loadClient(pi.metadata.client_id ?? "")
      if (cl) await message(cl, "cobroFallido", pi.amount / 100)
      return
    }
  }
}

export type AutopayRun = { day: boolean; charged: number; failed: number; skipped: number }

/** Charge the saved cards of auto-pay clients for what they owe, on days 1, 5 and 9 (once per client and day). */
export async function runAutopay(today = todayInMexico()): Promise<AutopayRun> {
  const out: AutopayRun = { day: isAutopayDay(today), charged: 0, failed: 0, skipped: 0 }
  if (!out.day) return out
  const rows = (await getPool().query(`select client_id, customer_id, payment_method_id from stripe_customers where autopay and payment_method_id <> ''`)).rows as { client_id: string; customer_id: string; payment_method_id: string }[]
  for (const r of rows) {
    const cl = await loadClient(r.client_id)
    const owed = cl ? Math.round(ledger(cl, await loadPayments(cl.id), today).owed * 100) / 100 : 0
    // Skipped: nothing owed, or an OXXO/SPEI payment on its way (started in the last 10 days, not yet paid).
    const onItsWay = cl
      ? ((await getPool().query(`select 1 from online_payments where client_id = $1 and kind in ('oxxo', 'spei') and status in ('pending', 'waiting') and created_at > now() - interval '10 days' limit 1`, [cl.id])).rowCount ?? 0) > 0
      : false
    if (!cl || owed <= 0 || onItsWay) {
      out.skipped++
      continue
    }
    try {
      const pi = await stripe().paymentIntents.create(
        { amount: centavos(owed), currency: "mxn", customer: r.customer_id, payment_method: r.payment_method_id, off_session: true, confirm: true, description: "Servicio de internet GigaFazt (cobro automático)", metadata: { client_id: cl.id, kind: "autopay" } },
        { idempotencyKey: `autopay-${cl.id}-${today}` }
      )
      await getPool().query(`insert into online_payments (id, client_id, kind, amount, status, payment_intent_id) values ($1, $2, 'autopay', $3, 'pending', $1) on conflict (id) do nothing`, [pi.id, cl.id, owed])
      if (pi.status === "succeeded") await markPaid(pi.id, pi.id, pi.amount_received / 100)
      out.charged++
    } catch (e) {
      // A decline (card error) comes back as an exception with the PaymentIntent in it.
      const err = e as { raw?: { payment_intent?: { id?: string } }; message?: string }
      const id = err.raw?.payment_intent?.id ?? `autopay-fail-${cl.id}-${today}`
      // Inserted as failed only if the webhook didn't record it first (then it already messaged the client).
      const r = await getPool().query(`insert into online_payments (id, client_id, kind, amount, status, payment_intent_id, error) values ($1, $2, 'autopay', $3, 'failed', $1, $4) on conflict (id) do nothing`, [
        id,
        cl.id,
        owed,
        (err.message ?? "error").slice(0, 300),
      ])
      if ((r.rowCount ?? 0) > 0) await message(cl, "cobroFallido", owed)
      out.failed++
    }
  }
  return out
}

/** The client's auto-pay status (for the portal). */
export async function autopayOf(clientId: string): Promise<{ active: boolean; brand: string; last4: string }> {
  const r = (await getPool().query(`select autopay, card_brand, card_last4 from stripe_customers where client_id = $1`, [clientId])).rows[0] as { autopay: boolean; card_brand: string; card_last4: string } | undefined
  return { active: !!r?.autopay, brand: r?.card_brand ?? "", last4: r?.card_last4 ?? "" }
}

/** Auto-pay off (the client from the portal, or staff): the saved card is detached from Stripe too. */
export async function stopAutopay(clientId: string) {
  const r = (await getPool().query(`update stripe_customers set autopay = false, updated_at = now() where client_id = $1 returning payment_method_id`, [clientId])).rows[0] as { payment_method_id: string } | undefined
  if (r?.payment_method_id && stripeConfigured()) await stripe().paymentMethods.detach(r.payment_method_id).catch(() => undefined)
  await getPool().query(`update stripe_customers set payment_method_id = '', card_brand = '', card_last4 = '', card_funding = '' where client_id = $1`, [clientId])
}
