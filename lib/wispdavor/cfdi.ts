/**
 * CFDI 4.0 for a client's payment (WispDavor → Facturas, owner 2026-11-21: Facturama, "Only who asks"). Pure: builds the
 * body of Facturama's API Web `POST /3/cfdis` (shape from Facturama's own request collection, "CFDI 4.0 Ingreso") and
 * checks the receiver's data. The issuer (RFC, regime, seals) is the Facturama account's; these settings are the rest.
 *
 * Prices in Cobranza include IVA (16 %): the invoice splits them into subtotal + IVA. Payment form by how it was paid:
 * cash/OXXO 01, transfer/SPEI 03, credit card 04, debit card 28, other 99; method PUE (paid in one go).
 */
import type { Client, Fiscal } from "../clients/model"
import { addMonths, billingStart, chargeFor, type Payment } from "../payments/model"

export type CfdiSettings = {
  /** The issuer's postal code (lugar de expedición). */
  expeditionPlace: string
  serie: string
  /** SAT product/service code: the owner's accountant decides (81112101 or 81161700 were the candidates found). */
  productCode: string
  unitCode: string
  unit: string
  /** {plan} and {mes} are filled in. */
  description: string
}

export const DEFAULT_CFDI: CfdiSettings = { expeditionPlace: "", serie: "", productCode: "", unitCode: "E48", unit: "Unidad de servicio", description: "Servicio de internet {plan} {mes}" }

/** SAT regimes a receiver can have (c_RegimenFiscal) and CFDI uses (c_UsoCFDI) offered in the form. */
export const REGIMES = ["601", "603", "605", "606", "608", "612", "616", "621", "625", "626"] as const
/** G03 gastos en general, S01 sin efectos fiscales: the uses that fit an internet service. */
export const USES = ["G03", "S01"] as const

export const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/

export type FiscalIssue = "rfc" | "name" | "regime" | "zip" | "use"

export function fiscalIssues(f: Fiscal): FiscalIssue[] {
  const out: FiscalIssue[] = []
  if (!RFC_RE.test(f.rfc)) out.push("rfc")
  if (!f.name.trim()) out.push("name")
  if (!(REGIMES as readonly string[]).includes(f.regime)) out.push("regime")
  if (!/^\d{5}$/.test(f.zip)) out.push("zip")
  if (!(USES as readonly string[]).includes(f.use)) out.push("use")
  return out
}

export const settingsReady = (s: CfdiSettings) => /^\d{5}$/.test(s.expeditionPlace) && /^\d{8}$/.test(s.productCode) && !!s.unitCode.trim() && !!s.serie.trim()

/** SAT payment form of a Cobranza payment (cardFunding from Stripe when known). */
export function paymentForm(p: Pick<Payment, "method">, cardFunding = ""): string {
  if (p.method === "efectivo" || p.method === "deposito") return "01"
  if (p.method === "transferencia") return "03"
  if (p.method === "tarjeta") return cardFunding === "debit" ? "28" : "04"
  return "99"
}

const round2 = (x: number) => Math.round(x * 100) / 100

const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" })

/**
 * The months a payment pays (owner, 2026-11-21: "Months the payment covers"), the way Cobranza applies payments: all of
 * the client's payments in date order fill the months from the billing start, oldest first.
 */
export function monthsCovered(c: Client, payments: Payment[], paymentId: string, today: string): string[] {
  const mine = payments.filter((p) => p.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const k = mine.findIndex((p) => p.id === paymentId)
  if (k < 0) return []
  const from = mine.slice(0, k).reduce((a, p) => a + p.amount, 0)
  const to = from + mine[k].amount
  const out: string[] = []
  let cum = 0
  let m = billingStart(c, payments, today)
  for (let i = 0; i < 240 && cum < to - 0.005; i++, m = addMonths(m, 1)) {
    const charge = chargeFor(c, m)
    if (charge <= 0) {
      // Nothing charged this month: stop if the client has nothing that will ever be charged.
      if (!c.services.some((s) => s.status !== "cancelado" && s.monthly)) break
      continue
    }
    if (cum + charge > from + 0.005) out.push(m)
    cum += charge
  }
  return out
}

/** "octubre de 2026", "octubre y noviembre de 2026", "noviembre de 2026 a enero de 2027". */
export function monthsLabel(months: string[]): string {
  if (!months.length) return ""
  if (months.length === 1) return monthName(months[0])
  const [a, b] = [months[0], months[months.length - 1]]
  const sameYear = a.slice(0, 4) === b.slice(0, 4)
  const name = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "long" })
  if (months.length === 2 && sameYear) return `${name(a)} y ${monthName(b)}`
  return `${sameYear ? name(a) : monthName(a)} a ${monthName(b)}`
}

/** `months`: what {mes} says (monthsLabel of monthsCovered); without it, the payment date's month. */
export function cfdiBody(c: Client, p: Payment, s: CfdiSettings, opts: { folio?: string; cardFunding?: string; months?: string } = {}) {
  const total = round2(p.amount)
  const subtotal = round2(total / 1.16)
  const iva = round2(total - subtotal)
  const plan = c.services.find((x) => x.type === "internet" && x.status !== "cancelado")?.plan ?? ""
  return {
    NameId: "1",
    Currency: "MXN",
    ...(s.serie ? { Serie: s.serie } : {}),
    ...(opts.folio ? { Folio: opts.folio } : {}),
    CfdiType: "I",
    PaymentForm: paymentForm(p, opts.cardFunding),
    PaymentMethod: "PUE",
    ExpeditionPlace: s.expeditionPlace,
    Exportation: "01",
    Receiver: { Rfc: c.fiscal.rfc, Name: c.fiscal.name, CfdiUse: c.fiscal.use, FiscalRegime: c.fiscal.regime, TaxZipCode: c.fiscal.zip },
    Items: [
      {
        ProductCode: s.productCode,
        IdentificationNumber: "INTERNET",
        Description: s.description.replace("{plan}", plan).replace("{mes}", opts.months || monthName(p.date.slice(0, 7))).replace(/\s+/g, " ").trim(),
        Unit: s.unit,
        UnitCode: s.unitCode,
        UnitPrice: subtotal,
        Quantity: 1,
        Subtotal: subtotal,
        TaxObject: "02",
        Taxes: [{ Total: iva, Name: "IVA", Base: subtotal, Rate: 0.16, IsRetention: false }],
        Total: total,
      },
    ],
  }
}

/** Facturama's cancellation motives (SAT): 02 = issued with errors, no related invoice (the usual one). */
export const CANCEL_MOTIVES = ["01", "02", "03", "04"] as const
