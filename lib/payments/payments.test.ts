import { describe, expect, it } from "vitest"
import { decodeClient, newClient, newService, type Client } from "../clients/model"
const decodeClientOf = (v: unknown) => decodeClient(v)!
import { addMonths, billingStart, collectionStats, decodePayment, dueDate, installMonthCharged, ledger, monthsBetween, morososLines, newPayment, paymentsCsv } from "./model"

const client = (p: Partial<Client> = {}, monthly = 400): Client =>
  newClient({ name: "Ana", services: [newService("internet", { monthly, pppoeUser: "ana-1204", plan: "plan-500M", start: "2026-01-10" })], ...p })
const pay = (c: Client, date: string, amount: number) => newPayment({ clientId: c.id, date, amount })

describe("payments", () => {
  it("months, invoices due on day 1, and the 15th rule", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(monthsBetween("2026-10", "2027-01")).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"])
    expect(monthsBetween("2026-12", "2026-11")).toEqual([])
    expect(dueDate("2026-02")).toBe("2026-02-01")
    expect(installMonthCharged("2026-11-15")).toBe(true)
    expect(installMonthCharged("2026-11-16")).toBe(false)
  })
  it("billing starts at Cobrar desde, else the first payment or this month, never before the first service", () => {
    const c = client()
    expect(billingStart(c, [], "2026-11-18")).toBe("2026-11")
    expect(billingStart(c, [pay(c, "2026-08-03", 400)], "2026-11-18")).toBe("2026-08")
    expect(billingStart({ ...c, billingFrom: "2026-03" }, [], "2026-11-18")).toBe("2026-03")
    const late = client({ services: [newService("internet", { monthly: 400, start: "2026-11-02" })] })
    expect(billingStart(late, [pay(late, "2026-09-01", 400)], "2026-11-18")).toBe("2026-11")
  })
  it("no payments recorded: only this month counts; due on the 1st, pay by the 10th, late (cut) on the 11th", () => {
    const c = client()
    expect(ledger(c, [], "2026-11-01")).toMatchObject({ status: "por-vencer", owed: 400, lateMonths: [] })
    expect(ledger(c, [], "2026-11-10")).toMatchObject({ status: "por-vencer", owed: 400, lateMonths: [] })
    expect(ledger(c, [], "2026-11-11")).toMatchObject({ status: "atrasado", owed: 400, lateMonths: ["2026-11"] })
    expect(morososLines([c], [], "2026-11-10")).toBe("")
    expect(morososLines([c], [], "2026-11-11")).toBe("ana-1204,plan-500M")
    expect(ledger(c, [], "2026-11-20").coveredUntil).toBe("")
  })
  it("payments cover the oldest month first; partial, ahead, and suspended services still owe", () => {
    const c = client({ billingFrom: "2026-09" })
    const l = ledger(c, [pay(c, "2026-09-04", 400), pay(c, "2026-10-20", 200)], "2026-11-18")
    expect(l).toMatchObject({ paidTotal: 600, owed: 600, coveredUntil: "2026-09", lateMonths: ["2026-10", "2026-11"], status: "atrasado" })
    const ahead = ledger(c, [pay(c, "2026-09-04", 2100)], "2026-11-18")
    expect(ahead).toMatchObject({ status: "al-corriente", owed: 0, coveredUntil: "2027-01", credit: 100 })
    const susp = { ...c, services: c.services.map((s) => ({ ...s, status: "suspendido" as const })) }
    expect(ledger(susp, [], "2026-11-18").owed).toBe(1200)
    const gone = { ...c, services: c.services.map((s) => ({ ...s, status: "cancelado" as const })) }
    expect(ledger(gone, [], "2026-11-18")).toMatchObject({ status: "sin-cobro", owed: 0 })
  })
  it("this month's totals, the MikroTik list of late clients and the CSV", () => {
    const a = client({ billingFrom: "2026-10" })
    const b = client({ name: "Luis" }, 500)
    const list = [a, b]
    const ps = [pay(a, "2026-11-02", 400), pay(b, "2026-11-05", 500)]
    expect(collectionStats(list, ps, "2026-11-18")).toEqual({ expected: 900, collected: 900, late: 1, lateAmount: 400, soon: 0, payments: 2 })
    expect(morososLines(list, ps, "2026-11-18")).toBe("ana-1204,plan-500M")
    const csv = paymentsCsv(ps, () => 'Ana "La" López', () => "Efectivo")
    expect(csv.startsWith("﻿Fecha,Cliente,Monto")).toBe(true)
    expect(csv).toContain('2026-11-02,"Ana ""La"" López",400.00,Efectivo')
  })
  it("reads stored values leniently", () => {
    expect(decodePayment({ id: "x", clientId: "../c", date: "2026-13-45", amount: 12.345, method: "bitcoin" })).toMatchObject({ clientId: "", date: "", amount: 12.35, method: "otro" })
    expect(decodePayment({ amount: -5 })?.amount).toBe(0)
    expect(decodePayment("x")).toBeNull()
  })
})

describe("first month, grace and cancellations (owner, 2026-11-19)", () => {
  const svc = (p: Parameters<typeof newService>[1]) => newService("internet", { monthly: 396, pppoeUser: "u1", ...p })
  it("installed after the 15th: that month is free, the first invoice is next month's (due the 1st, late the 11th)", () => {
    const c = newClient({ services: [svc({ start: "2026-11-19" })] })
    expect(ledger(c, [], "2026-11-19")).toMatchObject({ status: "al-corriente", owed: 0, lateMonths: [], nextDue: "2026-12-01" })
    expect(morososLines([c], [], "2026-11-30")).toBe("")
    expect(ledger(c, [], "2026-12-04")).toMatchObject({ status: "por-vencer", owed: 396 })
    expect(ledger(c, [], "2026-12-11")).toMatchObject({ status: "atrasado", owed: 396, lateMonths: ["2026-12"] })
  })
  it("installed by the 15th: that month is charged, due on the installation day with the same 10 days", () => {
    const c = newClient({ services: [svc({ start: "2026-11-10" })] })
    expect(ledger(c, [], "2026-11-10")).toMatchObject({ status: "por-vencer", owed: 396, nextDue: "2026-11-10" })
    expect(ledger(c, [], "2026-11-19")).toMatchObject({ status: "por-vencer", lateMonths: [] })
    expect(ledger(c, [], "2026-11-20")).toMatchObject({ status: "atrasado", lateMonths: ["2026-11"] })
    expect(ledger(newClient({ services: [svc({ start: "2026-11-15" })] }), [], "2026-11-15").owed).toBe(396)
  })
  it("paying ahead at installation covers the following months", () => {
    const c = newClient({ id: "cli-first1", services: [svc({ start: "2026-11-19" })] })
    const l = ledger(c, [newPayment({ clientId: "cli-first1", date: "2026-11-19", amount: 792 })], "2026-11-19")
    expect(l).toMatchObject({ coveredUntil: "2027-01", credit: 0, nextDue: "2027-02-01" })
  })
  it("a cancelled service keeps owing the months invoiced before its cancellation, and isn't cut again", () => {
    const c = newClient({ billingFrom: "2026-09", services: [svc({ start: "2026-08-10", status: "cancelado", cancelledAt: "2026-11-10" })] })
    // September, October and November (invoiced the 1st, before the 10th) are owed.
    expect(ledger(c, [], "2026-11-19")).toMatchObject({ status: "atrasado", owed: 396 * 3, lateMonths: ["2026-09", "2026-10", "2026-11"] })
    expect(morososLines([c], [], "2026-11-19")).toBe("")
    // Cancelled on the 1st: that month's invoice isn't owed.
    const early = newClient({ billingFrom: "2026-11", services: [svc({ start: "2026-08-10", status: "cancelado", cancelledAt: "2026-11-01" })] })
    expect(ledger(early, [], "2026-11-19")).toMatchObject({ owed: 0, status: "sin-cobro" })
    // Cancelled without a date (before dates were kept): nothing owed, as before.
    expect(ledger(newClient({ billingFrom: "2026-09", services: [svc({ status: "cancelado" })] }), [], "2026-11-19").owed).toBe(0)
  })
  it("the cancellation date only stays on cancelled services", () => {
    const c = decodeClientOf({ services: [{ type: "internet", status: "activo", cancelledAt: "2026-11-10" }, { type: "internet", status: "cancelado", cancelledAt: "2026-11-10" }] })
    expect(c.services.map((s) => s.cancelledAt)).toEqual(["", "2026-11-10"])
  })
})

describe("dated prices (owner, 2026-11-19)", () => {
  it("a price change applies from next month; past unpaid months keep the price they had", async () => {
    const { setPrice } = await import("../clients/model")
    let s = newService("internet", { monthly: 396, start: "2026-08-10", pppoeUser: "u1" })
    // Typed digit by digit in November: one change, the old price kept through November.
    for (const v of [4, 49, 496]) s = setPrice(s, v, "2026-11")
    expect(s.priceHistory).toEqual([{ until: "2026-11", monthly: 396 }])
    const c = newClient({ billingFrom: "2026-10", services: [s] })
    expect(ledger(c, [], "2026-11-19").months.map((m) => m.charge)).toEqual([396, 396])
    expect(ledger(c, [], "2026-12-19")).toMatchObject({ owed: 396 + 396 + 496 })
    // Back to the earlier price in the same month: nothing changed.
    expect(setPrice(s, 396, "2026-11").priceHistory).toEqual([])
    // Installed this month by the 15th: this month is charged, so it keeps its price; after the 15th, nothing charged yet.
    expect(setPrice(newService("internet", { monthly: 396, start: "2026-11-02" }), 496, "2026-11").priceHistory).toEqual([{ until: "2026-11", monthly: 396 }])
    expect(setPrice(newService("internet", { monthly: 396, start: "2026-11-20" }), 496, "2026-11").priceHistory).toEqual([])
    expect(setPrice(newService("internet", { monthly: null }), 496, "2026-11").priceHistory).toEqual([])
  })
  it("the history survives a save and is read oldest first", () => {
    const c = decodeClientOf({ services: [{ type: "internet", monthly: 596, priceHistory: [{ until: "2026-11", monthly: 496 }, { until: "2026-06", monthly: 396 }, { until: "bad", monthly: 1 }] }] })
    expect(c.services[0].priceHistory).toEqual([{ until: "2026-06", monthly: 396 }, { until: "2026-11", monthly: 496 }])
  })
})
