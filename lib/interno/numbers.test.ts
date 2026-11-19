import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { newReport } from "../reports/model"
import { newRoom, newRoomCarrier, newSite } from "../sites/model"
import { lastMonths, monthNumbers, siteNumbers } from "./numbers"

describe("business numbers", () => {
  const ana = newClient({ id: "cli-ana001", siteId: "site-0001", services: [newService("internet", { monthly: 396, start: "2026-09-10" })] })
  const beto = newClient({ id: "cli-beto01", siteId: "site-0001", services: [newService("internet", { monthly: 496, start: "2026-08-01", status: "cancelado", cancelledAt: "2026-10-20" })] })
  it("expected, collected, new and cancelled services, active clients and revenue per client", () => {
    const pays = [newPayment({ clientId: ana.id, date: "2026-10-05", amount: 396 }), newPayment({ clientId: beto.id, date: "2026-10-06", amount: 496 })]
    const reps = [newReport({ createdAt: "2026-10-02T10:00:00Z", status: "resuelto", resolvedAt: "2026-10-02T14:00:00Z" }), newReport({ createdAt: "2026-10-09T10:00:00Z" })]
    const [sep, oct, nov] = monthNumbers([ana, beto], pays, reps, ["2026-09", "2026-10", "2026-11"])
    // September: Ana installed (not charged), Beto charged.
    expect(sep).toMatchObject({ expected: 496, newServices: 1, activeClients: 2 })
    // October: both charged (Beto's due day, the 1st, is before his cancellation), both paid.
    expect(oct).toMatchObject({ expected: 892, collected: 892, rate: 1, cancelled: 1, activeClients: 1, reportsOpened: 2, reportsResolved: 1, avgHours: 4 })
    expect(oct.arpu).toBe(892)
    // November: only Ana.
    expect(nov).toMatchObject({ expected: 396, collected: 0, rate: 0, activeClients: 1 })
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"])
  })
  it("profit per location: income − building − links, least profitable first", () => {
    const site = newSite({ id: "site-0001", name: "Torre A", rentMonthly: 1000, rooms: [newRoom({ carriers: [newRoomCarrier({ monthly: 2000 })] })] })
    const empty = newSite({ id: "site-0002", name: "Vacío", rentMonthly: 500 })
    const rows = siteNumbers([site, empty], [ana, beto])
    expect(rows.map((r) => [r.name, r.income, r.profit])).toEqual([
      ["Torre A", 396, 396 - 1000 - 2000],
      ["Vacío", 0, -500],
    ])
  })
})
