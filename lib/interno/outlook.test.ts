import { describe, expect, it } from "vitest"
import { newClient, newService, type Client } from "../clients/model"
import type { Payment } from "../payments/model"
import { newReport } from "../reports/model"
import { monthNumbers, lastMonths } from "./numbers"
import { averageChurn, forecast, weekFigures, weeklyText, weeks } from "./outlook"

const client = (id: string, s: Partial<ReturnType<typeof newService>>): Client => ({ ...newClient(), id, name: `Cliente ${id}`, services: [{ ...newService("internet"), id: `${id}-s`, status: "activo", monthly: 396, start: "2026-01-10", ...s }] })
const pay = (clientId: string, date: string, amount: number): Payment => ({ id: `${clientId}-${date}`, clientId, date, amount, method: "efectivo", reference: "", notes: "", by: "", createdAt: "", updatedAt: "" }) as Payment

describe("Phase 10: outlook", () => {
  it("forecast: what current clients will be charged; churn applied month after month", () => {
    const clients = [client("a", {}), client("b", { monthly: 596 }), client("c", { status: "cancelado", cancelledAt: "2026-10-05", cancelReason: "" })]
    const rows = monthNumbers(clients, [], [], lastMonths("2026-11", 12))
    const f = forecast(clients, rows, "2026-11")
    expect(f.rows.map((r) => r.month)).toEqual(["2026-12", "2027-01", "2027-02"])
    expect(f.rows[0].scheduled).toBe(992)
    expect(f.churn).not.toBeNull()
    expect(f.rows[1].withChurn).toBeLessThan(f.rows[0].withChurn)
    expect(averageChurn(monthNumbers([client("a", {})], [], [], lastMonths("2026-11", 12)))).toBe(0)
  })
  it("weekly summary: last 7 days against the 7 before", () => {
    expect(weeks("2026-11-23")).toEqual({ now: { from: "2026-11-16", to: "2026-11-22" }, before: { from: "2026-11-09", to: "2026-11-15" } })
    const clients = [client("a", { start: "2026-11-17" }), client("b", {})]
    const payments = [pay("a", "2026-11-18", 396), pay("b", "2026-11-10", 396), pay("b", "2026-11-23", 396)]
    const reports = [{ ...newReport({ category: "lento" }), createdAt: "2026-11-20T15:00:00.000Z" }]
    expect(weekFigures(clients, payments, reports, weeks("2026-11-23").now)).toEqual({ collected: 396, payments: 1, newServices: 1, cancelled: 0, reportsOpened: 1, reportsResolved: 0 })
    const text = weeklyText({ clients, payments, reports, today: "2026-11-23", outages: 2, expectedMonth: 792, collectedMonth: 792, link: "https://x/interno" })
    expect(text).toContain("Cobrado: $396.00 en 1 pagos (igual vs semana anterior)")
    expect(text).toContain("altas 1 · bajas 0")
    expect(text).toContain("Caídas detectadas: 2")
    expect(text.split("\n").at(-1)).toBe("https://x/interno")
  })
})
