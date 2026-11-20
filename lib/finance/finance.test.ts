import { describe, expect, it } from "vitest"
import { agingOf, agingTotals, balanceOf, complementDeadline, complementPending, decodeCfdi, finStatus, isOpenDoc, newFinPayment, overpaid } from "./common"
import { decodePayable, newPayable, recurringBills } from "./payables"
import { decodeReceivable, newReceivable, serviceReceivables } from "./receivables"
import { newSite, newRoom, newRoomCarrier } from "../sites/model"
import { newProvider } from "../providers/model"
import { newClient, newService } from "../clients/model"

const UUID = "3F1C2A4E-1111-4222-8333-944455556666"

describe("accounts payable and receivable (2026-11-19)", () => {
  it("balance and status: pending, partial, overdue, paid, cancelled", () => {
    const d = newPayable({ amount: 1000, dueDate: "2026-11-20" })
    expect(finStatus(d, "2026-11-19")).toBe("pendiente")
    const part = { ...d, payments: [newFinPayment({ date: "2026-11-10", amount: 400 })] }
    expect(balanceOf(part)).toBe(600)
    expect(finStatus(part, "2026-11-19")).toBe("parcial")
    expect(finStatus(part, "2026-11-21")).toBe("vencido")
    expect(finStatus({ ...part, payments: [...part.payments, newFinPayment({ amount: 600 })] }, "2026-12-30")).toBe("pagado")
    expect(finStatus({ ...d, cancelled: true }, "2026-12-30")).toBe("cancelado")
  })
  it("aging buckets by days past due", () => {
    expect(agingOf("2026-11-20", "2026-11-19")).toBe("porVencer")
    expect(agingOf("2026-11-01", "2026-11-19")).toBe("d0_30")
    expect(agingOf("2026-09-25", "2026-11-19")).toBe("d31_60")
    expect(agingOf("2026-08-25", "2026-11-19")).toBe("d61_90")
    expect(agingOf("2026-01-01", "2026-11-19")).toBe("d90")
    expect(agingTotals([{ due: "2026-11-01", amount: 100 }, { due: "2026-11-05", amount: 50.5 }, { due: "2027-01-01", amount: 10 }], "2026-11-19")).toMatchObject({ d0_30: 150.5, porVencer: 10 })
  })
  it("PPD: every payment needs its own complemento, due the 5th of the month after it; PUE never", () => {
    expect(complementDeadline("2026-12-15")).toBe("2027-01-05")
    const p1 = newFinPayment({ date: "2026-10-18", amount: 100 })
    const p2 = newFinPayment({ date: "2026-11-18", amount: 100 })
    const ppd = { cfdi: { uuid: UUID, method: "PPD" as const }, payments: [p1, p2] }
    expect(complementPending(ppd)).toBe("2026-11-05")
    // The first payment's complemento done: the second one is still pending.
    expect(complementPending({ ...ppd, payments: [{ ...p1, repDone: true }, p2] })).toBe("2026-12-05")
    expect(complementPending({ ...ppd, payments: [{ ...p1, repDone: true }, { ...p2, repDone: true }] })).toBeNull()
    expect(complementPending({ ...ppd, cfdi: { ...ppd.cfdi, method: "PUE" } })).toBeNull()
    expect(decodeCfdi({ uuid: UUID.toLowerCase(), method: "PPD" })).toMatchObject({ uuid: UUID, method: "PPD" })
    expect(decodeCfdi({ uuid: "123", method: "X" })).toMatchObject({ uuid: "", method: "" })
    // Saved when the complemento was one box for the invoice: every payment counts as done.
    const old = decodePayable({ amount: 200, cfdi: { method: "PPD", complement: true }, payments: [{ date: "2026-11-01", amount: 100 }] })!
    expect(old.payments[0].repDone).toBe(true)
  })
  it("a document without an amount stays open (pending), and paying more than the amount is flagged", () => {
    const blank = newPayable({ concept: "Recién agregada" })
    expect(finStatus(blank, "2026-11-19")).toBe("pendiente")
    expect(isOpenDoc(blank)).toBe(true)
    expect(overpaid({ amount: 100, payments: [newFinPayment({ amount: 150 })] })).toBe(true)
    expect(overpaid({ amount: 100, payments: [newFinPayment({ amount: 100 })] })).toBe(false)
  })
  it("the month's fixed bills come from the deployments with one id per month (no duplicates between phones)", () => {
    const prov = { ...newProvider("carrier", "Totalplay"), terms: { ...newProvider().terms, creditDays: 15 } }
    const site = newSite({ name: "Torre A", rentMonthly: 3000, powerMonthly: 800, powerPayer: "nosotros", rooms: [newRoom({ carriers: [newRoomCarrier({ providerId: prov.id, name: "Fibra 1G", monthly: 2500 })] })] })
    const bills = recurringBills("2026-11", [site, newSite({ name: "Sin costos", powerPayer: "edificio", powerMonthly: 900 })], [prov])
    expect(bills.map((b) => [b.category, b.amount, b.dueDate])).toEqual([["renta", 3000, "2026-11-01"], ["luz", 800, "2026-11-01"], ["enlace", 2500, "2026-11-16"]])
    expect(recurringBills("2026-11", [site], [prov]).map((b) => b.id)).toEqual(bills.map((b) => b.id))
    expect(bills.every((b) => /^[\w-]{6,64}$/.test(b.id))).toBe(true)
    expect(decodePayable(JSON.parse(JSON.stringify(bills[2])))).toMatchObject({ providerId: prov.id, category: "enlace" })
  })
  it("receivables: one-off charges decode; monthly service comes from Cobranza's ledger", () => {
    expect(decodeReceivable({ ...newReceivable({ concept: "Red de fibra", amount: 45000 }), category: "rara" })).toMatchObject({ concept: "Red de fibra", amount: 45000, category: "otro" })
    const c = newClient({ name: "Ana", billingFrom: "2026-10", services: [newService("internet", { monthly: 396, start: "2026-01-10" })] })
    expect(serviceReceivables([c], [], "2026-11-19").map((s) => [s.month, s.due, s.lastDay, s.amount])).toEqual([["2026-10", "2026-10-01", "2026-10-10", 396], ["2026-11", "2026-11-01", "2026-11-10", 396]])
    // In the aging, a month due the 1st isn't overdue until the 11th (as in Cobranza).
    expect(agingOf("2026-11-10", "2026-11-10")).toBe("porVencer")
    expect(agingOf("2026-11-10", "2026-11-11")).toBe("d0_30")
  })
})

describe("Hoy shows bills, overdue charges and pending complementos (2026-11-19)", () => {
  it("bills overdue or due within 3 days; charges past due; PPD payments without complemento, both ways", async () => {
    const { todaySummary, allClear } = await import("../interno/today")
    const base = { reports: [], clients: [], payments: [], tools: [], items: [], moves: [], units: [], notes: [] }
    const late = newPayable({ concept: "Renta", amount: 3000, dueDate: "2026-11-15" })
    const soon = newPayable({ concept: "Enlace", amount: 2500, dueDate: "2026-11-22" })
    const later = newPayable({ concept: "Luz", amount: 800, dueDate: "2026-11-30" })
    const paid = newPayable({ concept: "Pagada", amount: 100, dueDate: "2026-11-10", payments: [newFinPayment({ date: "2026-11-09", amount: 100 })] })
    const charge = newReceivable({ concept: "Proyecto", amount: 10000, dueDate: "2026-11-01", cfdi: { uuid: "", method: "PPD" }, payments: [newFinPayment({ date: "2026-11-05", amount: 4000 })] })
    const s = todaySummary({ ...base, payables: [late, soon, later, paid], receivables: [charge] }, "2026-11-19")
    expect(s.bills.map((b) => [b.label, b.late])).toEqual([["Renta", true], ["Enlace", false]])
    expect(s.charges.map((c) => [c.label, c.balance])).toEqual([["Proyecto", 6000]])
    expect(s.complements).toEqual([{ id: charge.id, side: "cobrar", label: "Proyecto", deadline: "2026-12-05" }])
    expect(allClear(todaySummary(base, "2026-11-19"))).toBe(true)
  })
})

describe("fixed bills already typed by hand (owner review 2026-11-20)", () => {
  it("a bill of the same category, month and deployment (or none given), and for a link the same carrier, counts as there", async () => {
    const { lookalike } = await import("./payables")
    const rent = newPayable({ id: "ap-site-renta-2026-11", category: "renta", siteId: "site-0001", payee: "Torre", issueDate: "2026-11-01", amount: 2000 })
    const link = newPayable({ id: "ap-car-2026-11", category: "enlace", siteId: "site-0001", payee: "Totalplay", issueDate: "2026-11-01", amount: 3500 })
    const typedRent = newPayable({ category: "renta", concept: "Renta noviembre", issueDate: "2026-11-03" })
    const otherSite = newPayable({ category: "renta", siteId: "site-0002", issueDate: "2026-11-03" })
    const lastMonth = newPayable({ category: "renta", issueDate: "2026-10-01" })
    const typedLink = newPayable({ category: "enlace", concept: "Enlace TOTALPLAY", dueDate: "2026-11-22" })
    const otherLink = newPayable({ category: "enlace", concept: "Enlace Izzi", dueDate: "2026-11-22" })
    expect(lookalike(rent, [otherSite, lastMonth])).toBeUndefined()
    expect(lookalike(rent, [otherSite, typedRent])?.id).toBe(typedRent.id)
    expect(lookalike(link, [otherLink])).toBeUndefined()
    expect(lookalike(link, [otherLink, typedLink])?.id).toBe(typedLink.id)
    expect(lookalike(rent, [{ ...typedRent, cancelled: true }])).toBeUndefined()
  })
})
