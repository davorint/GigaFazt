/**
 * Cuentas por pagar (/interno/admin/cuentas-por-pagar, owner 2026-11-19): what we owe. Each bill has who we pay (a
 * provider from Proveedores, or a typed name), what for, the amount with IVA, issue and due dates, the payments made
 * (partial or whole), the invoice (CFDI) and an optional deployment.
 *
 * Fixed monthly bills come from what's already recorded (owner: "recurring + one-off"): each deployment's rent, its
 * power when we pay it, and each carrier link's monthly cost. They have a fixed id per month (`ap-<source>-<month>`),
 * so two phones adding the month's bills never duplicate them. Everything else is added by hand.
 *
 * Synced like the other sections (kind "porpagar", table `payables`). `decodePayable` never throws.
 */
import { newId } from "../survey/id"
import type { Provider } from "../providers/model"
import { providerName } from "../providers/model"
import { siteLabel, type Site } from "../sites/model"
import { decodeCfdi, decodePayments, day, emptyCfdi, idOf, isObj, legacyRep, money, pick, str, type Cfdi, type FinPayment } from "./common"

export const PAY_CATEGORIES = ["enlace", "renta", "luz", "materiales", "herramientas", "servicios", "impuestos", "nomina", "otro"] as const
export type PayCategory = (typeof PAY_CATEGORIES)[number]

export type Payable = {
  id: string
  /** From Proveedores ("" = not in the list: `payee` says who). */
  providerId: string
  payee: string
  category: PayCategory
  concept: string
  siteId: string
  /** MXN with IVA. */
  amount: number
  issueDate: string
  dueDate: string
  payments: FinPayment[]
  cfdi: Cfdi
  cancelled: boolean
  /** The fixed monthly bill it was made from ("" = typed by hand), e.g. "renta:<site>:2026-11". */
  recurKey: string
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

export function newPayable(p: Partial<Payable> = {}): Payable {
  return { id: newId(), providerId: "", payee: "", category: "otro", concept: "", siteId: "", amount: 0, issueDate: "", dueDate: "", payments: [], cfdi: emptyCfdi(), cancelled: false, recurKey: "", notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

/** yyyy-mm-dd plus whole days. */
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/**
 * The month's fixed bills from the deployments: rent, power (when we pay it) and each carrier link with a monthly cost.
 * Issued on day 1; carriers due after their provider's credit days (else day 1), the rest due day 1 (editable).
 */
export function recurringBills(month: string, sites: Site[], providers: Provider[]): Payable[] {
  const first = `${month}-01`
  const out: Payable[] = []
  for (const s of sites) {
    const name = siteLabel(s)
    if (s.rentMonthly) out.push(newPayable({ id: `ap-${s.id}-renta-${month}`, recurKey: `renta:${s.id}:${month}`, category: "renta", payee: name, concept: `Renta · ${name}`, siteId: s.id, amount: s.rentMonthly, issueDate: first, dueDate: first }))
    if (s.powerPayer === "nosotros" && s.powerMonthly) out.push(newPayable({ id: `ap-${s.id}-luz-${month}`, recurKey: `luz:${s.id}:${month}`, category: "luz", payee: name, concept: `Luz · ${name}`, siteId: s.id, amount: s.powerMonthly, issueDate: first, dueDate: first }))
    for (const r of s.rooms)
      for (const c of r.carriers) {
        if (!c.monthly) continue
        const p = providers.find((x) => x.id === c.providerId)
        const credit = p?.terms.creditDays ?? 0
        out.push(newPayable({ id: `ap-${c.id}-${month}`, recurKey: `enlace:${c.id}:${month}`, category: "enlace", providerId: p ? p.id : "", payee: p ? providerName(p) : c.name, concept: `Enlace ${c.name || (p ? providerName(p) : "")} · ${name}`.trim(), siteId: s.id, amount: c.monthly, issueDate: first, dueDate: credit ? plusDays(first, credit) : first }))
      }
  }
  return out
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/**
 * A bill entered by hand that looks like this fixed one (owner review 2026-11-20: the month's rent typed by hand was
 * offered again as missing): same category and month, the same deployment or none given, and for a link the same
 * provider, or the carrier's name in its payee or concept. Shown as "parece que ya está" instead of being added again.
 */
export function lookalike(b: Payable, list: Payable[]): Payable | undefined {
  const month = b.issueDate.slice(0, 7)
  return list.find((x) => {
    if (x.cancelled || x.id === b.id || x.category !== b.category || (x.issueDate || x.dueDate).slice(0, 7) !== month) return false
    if (x.siteId && x.siteId !== b.siteId) return false
    if (b.category !== "enlace") return true
    if (x.providerId && b.providerId) return x.providerId === b.providerId
    return !!b.payee && fold(`${x.payee} ${x.concept}`).includes(fold(b.payee))
  })
}

// ── Reading stored or synced values ─────────────────────────────────────────

export function decodePayable(v: unknown): Payable | null {
  if (!isObj(v)) return null
  return {
    id: idOf(v.id) || newId(),
    providerId: idOf(v.providerId),
    payee: str(v.payee, 200),
    category: pick(PAY_CATEGORIES, v.category, "otro"),
    concept: str(v.concept, 300),
    siteId: idOf(v.siteId),
    amount: money(v.amount),
    issueDate: day(v.issueDate),
    dueDate: day(v.dueDate),
    payments: decodePayments(v.payments, legacyRep(v.cfdi)),
    cfdi: decodeCfdi(v.cfdi),
    cancelled: v.cancelled === true,
    recurKey: str(v.recurKey, 120),
    notes: str(v.notes, 2000),
    by: str(v.by, 60),
    createdAt: typeof v.createdAt === "string" ? v.createdAt.slice(0, 40) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
