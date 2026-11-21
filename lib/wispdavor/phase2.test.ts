import { beforeEach, describe, expect, it, vi } from "vitest"
import { decodeClient, newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { DEFAULT_CFDI, cfdiBody, fiscalIssues, paymentForm, settingsReady } from "./cfdi"
import { amountToCharge, cobranzaMethod, isAutopayDay, methodsFor } from "./online"

vi.mock("server-only", () => ({}))

const fiscal = { rfc: "XAXX010101000", name: "CLIENTE PRUEBA", regime: "616", zip: "01000", use: "S01", email: "" }
const client = (p = {}) => newClient({ id: "cli-0001", name: "Ana López", billingFrom: "2026-09", services: [newService("internet", { monthly: 396, plan: "200M", start: "2026-09-01", pppoeUser: "ana" })], fiscal, ...p })
const SETTINGS = { ...DEFAULT_CFDI, expeditionPlace: "62000", serie: "GF", productCode: "81112101" }

describe("WispDavor phase 2: online payment rules", () => {
  it("charge the debt, else a month ahead; OXXO only between 10 and 10,000", () => {
    expect(amountToCharge({ owed: 792, monthly: 396 })).toBe(792)
    expect(amountToCharge({ owed: 0, monthly: 396 })).toBe(396)
    expect(methodsFor(396)).toEqual(["card", "oxxo", "spei"])
    expect(methodsFor(12000)).toEqual(["card", "spei"])
    expect(methodsFor(0)).toEqual([])
  })
  it("auto-pay days 1, 5 and 9; Cobranza methods", () => {
    expect(["2026-12-01", "2026-12-05", "2026-12-09", "2026-12-02"].map(isAutopayDay)).toEqual([true, true, true, false])
    expect([cobranzaMethod("card"), cobranzaMethod("spei"), cobranzaMethod("oxxo"), cobranzaMethod("autopay")]).toEqual(["tarjeta", "transferencia", "efectivo", "tarjeta"])
  })
})

describe("WispDavor phase 2: CFDI", () => {
  it("splits the price with IVA into subtotal + 16 %, PUE, payment form by method", () => {
    const b = cfdiBody(client(), newPayment({ clientId: "cli-0001", date: "2026-11-02", amount: 396, method: "transferencia" }), SETTINGS)
    expect(b).toMatchObject({ Serie: "GF", CfdiType: "I", PaymentForm: "03", PaymentMethod: "PUE", ExpeditionPlace: "62000", Receiver: { Rfc: "XAXX010101000", CfdiUse: "S01", FiscalRegime: "616", TaxZipCode: "01000" } })
    expect(b.Items[0]).toMatchObject({ ProductCode: "81112101", UnitCode: "E48", Subtotal: 341.38, Total: 396, Taxes: [{ Total: 54.62, Base: 341.38, Rate: 0.16, IsRetention: false }] })
    expect(b.Items[0].Description).toBe("Servicio de internet 200M noviembre de 2026")
    expect([paymentForm({ method: "efectivo" }), paymentForm({ method: "tarjeta" }), paymentForm({ method: "tarjeta" }, "debit"), paymentForm({ method: "otro" })]).toEqual(["01", "04", "28", "99"])
  })
  it("checks the receiver and the settings; old clients get empty fiscal data", () => {
    expect(fiscalIssues(fiscal)).toEqual([])
    expect(fiscalIssues({ ...fiscal, rfc: "nope", zip: "1" })).toEqual(["rfc", "zip"])
    expect(settingsReady(DEFAULT_CFDI)).toBe(false)
    expect(settingsReady(SETTINGS)).toBe(true)
    expect(decodeClient({ id: "cli-0002", name: "x" })?.fiscal).toEqual({ rfc: "", name: "", regime: "", zip: "", use: "", email: "" })
  })
})

// ── Stripe module with Stripe and the database mocked ─────────────────────────

const created: Record<string, unknown>[] = []
const queries: { sql: string; args: unknown[] }[] = []
let onlineRow: Record<string, unknown> | null = null

vi.mock("stripe", () => ({
  default: class {
    customers = { create: async () => ({ id: "cus_1" }) }
    checkout = { sessions: { create: async (p: Record<string, unknown>) => (created.push(p), { id: "cs_1", url: "https://checkout.stripe.com/x" }) } }
    paymentIntents = { retrieve: async () => ({ metadata: {}, payment_method: null }), create: async () => ({ id: "pi_auto", status: "processing", amount_received: 0 }) }
    paymentMethods = { detach: async () => ({}) }
  },
}))
vi.mock("../db/client", () => {
  const query = async (sql: string, args: unknown[] = []) => {
    queries.push({ sql, args })
    if (sql.includes("from stripe_customers where client_id")) return { rows: [{ customer_id: "cus_1" }] }
    if (sql.includes("from online_payments where id = $1 for update")) return { rows: onlineRow ? [onlineRow] : [] }
    if (sql.includes("from stripe_customers where autopay")) return { rows: [{ client_id: "cli-0001", customer_id: "cus_1", payment_method_id: "pm_1" }] }
    return { rows: [], rowCount: 1 }
  }
  return { getPool: () => ({ query, connect: async () => ({ query, release: () => undefined }) }), hasDatabase: () => true }
})
const addPayment = vi.fn(async (p: Record<string, unknown>) => ({ id: "pay_new", ...p }))
vi.mock("./db-server", () => ({
  loadClient: async () => client({ services: [newService("internet", { monthly: 396, plan: "200M", start: "2026-09-01", pppoeUser: "ana", status: "suspendido" })] }),
  loadPayments: async () => [],
  portalAddress: async () => "https://www.gigafazt.com/mi-cuenta#x",
  addPayment: (p: Record<string, unknown>) => addPayment(p),
}))
vi.mock("../reports/notify", () => ({ sendText: vi.fn(async () => ({ telegram: null, webhook: null })) }))

describe("WispDavor phase 2: Stripe flow (mocked)", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"
    created.length = 0
    queries.length = 0
    addPayment.mockClear()
  })

  it("Checkout per method: card (saved for auto-pay), OXXO 5 days, SPEI as a Mexican bank transfer", async () => {
    const { startCheckout } = await import("./stripe-server")
    await startCheckout(client(), "card", true, "https://www.gigafazt.com/mi-cuenta#tok")
    await startCheckout(client(), "oxxo", false, "https://www.gigafazt.com/mi-cuenta#tok")
    await startCheckout(client(), "spei", false, "https://www.gigafazt.com/mi-cuenta#tok")
    expect(created[0]).toMatchObject({ mode: "payment", allowed_payment_method_types: ["card"], payment_intent_data: { setup_future_usage: "off_session", metadata: { kind: "card", autopay: "1" } }, success_url: "https://www.gigafazt.com/mi-cuenta?pago=ok#tok" })
    expect(created[1]).toMatchObject({ allowed_payment_method_types: ["oxxo"], payment_method_options: { oxxo: { expires_after_days: 5 } } })
    expect(created[2]).toMatchObject({ allowed_payment_method_types: ["customer_balance"], payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } } } })
    // The amount comes from the ledger (from September, nothing paid): 3 months.
    expect((created[0].line_items as { price_data: { unit_amount: number } }[])[0].price_data.unit_amount).toBe(396 * 3 * 100)
  })

  it("a paid Checkout becomes one Cobranza payment; the same event again adds nothing", async () => {
    const { handleEvent } = await import("./stripe-server")
    const event = { type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", amount_total: 39600 } } } as never
    onlineRow = { client_id: "cli-0001", kind: "spei", amount: 396, status: "pending" }
    await handleEvent(event)
    expect(addPayment).toHaveBeenCalledTimes(1)
    // A fixed id from Stripe's payment: a retry after a failure is the same Cobranza record, not a second one.
    expect(addPayment.mock.calls[0][0]).toMatchObject({ id: "stripe-pi_1", clientId: "cli-0001", amount: 396, method: "transferencia", reference: "Stripe pi_1" })
    onlineRow = { ...onlineRow, status: "paid" }
    await handleEvent(event)
    expect(addPayment).toHaveBeenCalledTimes(1)
  })

  it("auto-pay charges only on days 1, 5 and 9", async () => {
    const { runAutopay } = await import("./stripe-server")
    expect(await runAutopay("2026-12-02")).toMatchObject({ day: false, charged: 0 })
    expect(await runAutopay("2026-12-01")).toMatchObject({ day: true, charged: 1 })
  })
})
