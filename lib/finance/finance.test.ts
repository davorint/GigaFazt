import { describe, expect, it } from "vitest"
import { agingOf, agingTotals, balanceOf, complementDeadline, complementPending, decodeCfdi, finStatus, newFinPayment } from "./common"
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
  it("PPD with a payment and no complemento: due the 5th of the next month; PUE never", () => {
    expect(complementDeadline("2026-12-15")).toBe("2027-01-05")
    const ppd = { cfdi: { uuid: UUID, method: "PPD" as const, complement: false, complementUuid: "" }, payments: [newFinPayment({ date: "2026-11-18", amount: 100 })] }
    expect(complementPending(ppd)).toBe("2026-12-05")
    expect(complementPending({ ...ppd, cfdi: { ...ppd.cfdi, complement: true } })).toBeNull()
    expect(complementPending({ ...ppd, cfdi: { ...ppd.cfdi, method: "PUE" } })).toBeNull()
    expect(decodeCfdi({ uuid: UUID.toLowerCase(), method: "PPD" })).toMatchObject({ uuid: UUID, method: "PPD" })
    expect(decodeCfdi({ uuid: "123", method: "X" })).toMatchObject({ uuid: "", method: "" })
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
    expect(serviceReceivables([c], [], "2026-11-19").map((s) => [s.month, s.due, s.amount])).toEqual([["2026-10", "2026-10-01", 396], ["2026-11", "2026-11-01", 396]])
  })
})
