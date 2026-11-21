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
/** Days an OXXO voucher stays valid (Stripe: 1–7, default 5). */
export const OXXO_DAYS = 5
export const AUTOPAY_DAYS = [1, 5, 9] as const

/** What to charge online: the debt, else a month ahead; 0 = nothing to charge. */
export function amountToCharge(l: Pick<Ledger, "owed" | "monthly">): number {
  const x = l.owed > 0.005 ? l.owed : l.monthly
  return Math.round(Math.max(0, x) * 100) / 100
}

/** Pesos to Stripe's smallest unit (centavos). */
export const centavos = (mxn: number) => Math.round(mxn * 100)

export const isAutopayDay = (today: string) => (AUTOPAY_DAYS as readonly number[]).includes(Number(today.slice(8, 10)))

/** The Cobranza payment method of an online payment. */
export const cobranzaMethod = (kind: PayKind) => (kind === "spei" ? "transferencia" : kind === "oxxo" ? "efectivo" : "tarjeta")

/** Which methods a client can use for this amount. */
export const methodsFor = (amount: number): PayKind[] => (amount <= 0 ? [] : amount >= OXXO_MIN && amount <= OXXO_MAX ? ["card", "oxxo", "spei"] : ["card", "spei"])
