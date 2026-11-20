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
    // September: Ana installed on the 10th (by the 15th: charged), Beto charged.
    expect(sep).toMatchObject({ expected: 892, newServices: 1, activeClients: 2 })
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

describe("dashboard, churn, clients at risk, penetration (owner, 2026-11-19)", () => {
  it("penetration counts clients with an active service over the building's apartments", async () => {
    const { newTower } = await import("../sites/model")
    const site = newSite({ id: "site-p0001", towers: [newTower({ apartments: 40 }), newTower({ apartments: 60 })] })
    const on = newClient({ siteId: site.id, services: [newService("internet", { monthly: 396, start: "2026-01-01" })] })
    const off = newClient({ siteId: site.id, services: [newService("internet", { monthly: 396, start: "2026-01-01", status: "cancelado", cancelledAt: "2026-05-01" })] })
    const [n] = siteNumbers([site], [on, off])
    expect([n.active, n.apartments, n.penetration]).toEqual([1, 100, 0.01])
    expect(siteNumbers([newSite()], [])[0].penetration).toBeNull()
  })
  it("churn = cancelled this month ÷ active at the end of last month; reasons counted, unrecorded ones too", async () => {
    const { churnRate, cancelReasons } = await import("./numbers")
    const rows = [{ activeClients: 20, lost: 0 }, { activeClients: 19, lost: 2 }] as never
    expect(churnRate(rows, 1)).toBe(0.1)
    expect(churnRate(rows, 0)).toBeNull()
    const gone = (r: string, at: string) => newClient({ services: [newService("internet", { start: "2025-01-01", status: "cancelado", cancelledAt: at, cancelReason: r as never })] })
    expect(cancelReasons([gone("precio", "2026-10-02"), gone("precio", "2026-11-01"), gone("", "2026-09-09"), gone("fallas", "2025-01-01")], ["2026-09", "2026-10", "2026-11"])).toEqual([
      { reason: "precio", n: 2 },
      { reason: "", n: 1 },
    ])
  })
  it("at risk: late, a broken promise, repeated reports; paid-up quiet clients and cancelled ones are not", async () => {
    const { clientsAtRisk } = await import("./numbers")
    const late = newClient({ id: "cli-late01", promiseDate: "2026-11-12", services: [newService("internet", { monthly: 396, start: "2026-06-01" })] })
    const fine = newClient({ id: "cli-fine01", services: [newService("internet", { monthly: 396, start: "2026-06-01" })] })
    const noisy = newClient({ id: "cli-noisy1", services: [newService("internet", { monthly: 396, start: "2026-06-01" })] })
    const gone = newClient({ id: "cli-gone01", services: [newService("internet", { monthly: 396, start: "2026-06-01", status: "cancelado", cancelledAt: "2026-07-01" })] })
    const pays = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].flatMap((m) => [fine, noisy].map((c) => newPayment({ clientId: c.id, date: `${m}-01`, amount: 396 })))
    const reps = [newReport({ clientId: noisy.id, createdAt: "2026-10-01T10:00:00Z" }), newReport({ clientId: noisy.id, createdAt: "2026-11-10T10:00:00Z" })]
    const r = clientsAtRisk([late, fine, noisy, gone], pays, reps, "2026-11-19")
    expect(r.map((x) => [x.client.id, x.reasons])).toEqual([
      ["cli-late01", ["atrasado", "promesa"]],
      ["cli-noisy1", ["reportes"]],
    ])
  })
})

describe("churn counts clients, not services (2026-11-19 review)", () => {
  it("a client dropping internet and TV together is one client lost and one reason; discarded reports don't make risk", async () => {
    const { churnRate, cancelReasons, clientsAtRisk } = await import("./numbers")
    const both = newClient({
      services: [
        newService("internet", { monthly: 396, start: "2026-01-01", status: "cancelado", cancelledAt: "2026-10-05", cancelReason: "mudanza" }),
        newService("iptv", { monthly: 250, start: "2026-01-01", status: "cancelado", cancelledAt: "2026-10-05" }),
      ],
    })
    const stays = newClient({ services: [newService("internet", { monthly: 396, start: "2026-01-01" })] })
    const rows = monthNumbers([both, stays], [], [], ["2026-09", "2026-10"])
    expect([rows[1].cancelled, rows[1].lost]).toEqual([2, 1])
    expect(churnRate(rows, 1)).toBe(0.5)
    expect(cancelReasons([both], ["2026-10"])).toEqual([{ reason: "mudanza", n: 1 }])
    const pays = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map((m) => newPayment({ clientId: stays.id, date: `${m}-01`, amount: 396 }))
    const reps = [newReport({ clientId: stays.id, createdAt: "2026-11-01T10:00:00Z", status: "descartado" }), newReport({ clientId: stays.id, createdAt: "2026-11-10T10:00:00Z" })]
    expect(clientsAtRisk([stays], pays, reps, "2026-11-19")).toEqual([])
  })
})
