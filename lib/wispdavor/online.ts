/**
 * Online payments (WispDavor phase 2, owner 2026-11-21: Stripe; card, OXXO, SPEI and card auto-pay). Pure rules shared
 * by the portal, the webhook and the auto-pay job (lib/wispdavor/stripe-server.ts).
 *
 * - What a client pays online: what they owe (Cobranza's ledger); with nothing owed, one month ahead (their monthly).
 * - OXXO takes 10.00 to 10,000.00 MXN (Stripe), so a larger amount can't go to OXXO.
 * - Auto-pay charges the saved card on day 1 (Cobranza's due day) and retries on days 5 and 9, before the cut on the
 *   11th (owner: "Day 1, retry 5 and 9").
 * - A paid payment becomes a Cobranza payment: card → tarjeta, SPEI → transferencia, OXXO → efectivo (cash at the store).
 */
import type { Ledger } from "../payments/model"

export const PAY_KINDS = ["card", "oxxo", "spei"] as const
export type PayKind = (typeof PAY_KINDS)[number] | "autopay"

export const OXXO_MIN = 10
export const OXXO_MAX = 10000
/** Days an OXXO voucher stays valid (Stripe: expires_after_days 1–7; the Checkout default differs between its pages). */
export const OXXO_DAYS = 5
export const AUTOPAY_DAYS = [1, 5, 9] as const

/** Stripe's smallest charge in MXN for card, OXXO and SPEI (Stripe docs: 10.00 MXN). */
export const ONLINE_MIN = 10

/**
 * What to charge online: the debt, else a month ahead; 0 = nothing to charge. A leftover under ONLINE_MIN (a partial
 * payment's remainder) can't be charged on its own, so it goes with the next month.
 */
export function amountToCharge(l: Pick<Ledger, "owed" | "monthly">): number {
  const x = l.owed > 0.005 ? (l.owed < ONLINE_MIN ? l.owed + l.monthly : l.owed) : l.monthly
  return Math.round(Math.max(0, x) * 100) / 100
}

/** Pesos to Stripe's smallest unit (centavos). */
export const centavos = (mxn: number) => Math.round(mxn * 100)

export const isAutopayDay = (today: string) => (AUTOPAY_DAYS as readonly number[]).includes(Number(today.slice(8, 10)))

/** The Cobranza payment method of an online payment. */
export const cobranzaMethod = (kind: PayKind) => (kind === "spei" ? "transferencia" : kind === "oxxo" ? "efectivo" : "tarjeta")

/** Which methods a client can use for this amount. */
export const methodsFor = (amount: number): PayKind[] => (amount < ONLINE_MIN ? [] : amount >= OXXO_MIN && amount <= OXXO_MAX ? ["card", "oxxo", "spei"] : ["card", "spei"])
