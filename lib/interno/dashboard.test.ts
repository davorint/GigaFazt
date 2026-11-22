import { describe, expect, it } from "vitest"
import { newAppointment } from "../agenda/model"
import { newClient, newService } from "../clients/model"
import { newReport } from "../reports/model"
import { installBacklog, lightHistogram, planMix, reportAges } from "./dashboard"

describe("Tablero figures", () => {
  const clients = [
    { ...newClient(), services: [{ ...newService("internet"), plan: "1G", status: "activo" as const, rxDbm: -19.4 }, { ...newService("iptv"), status: "activo" as const }] },
    { ...newClient(), services: [{ ...newService("internet"), plan: "200M", status: "activo" as const, rxDbm: -28.2 }] },
    { ...newClient(), services: [{ ...newService("internet"), plan: "200M", status: "suspendido" as const, rxDbm: -19.9 }] },
    { ...newClient(), services: [{ ...newService("internet"), plan: "500M", status: "cancelado" as const, rxDbm: -10 }] },
  ]
  it("plan mix: active services by plan, slowest first, and TV", () => {
    expect(planMix(clients)).toEqual({ plans: [{ plan: "200M", n: 1 }, { plan: "1G", n: 1 }], tv: 1 })
  })
  it("light in 1 dB bins with zones; cancelled services left out", () => {
    const h = lightHistogram(clients)
    expect(h.readings).toBe(3)
    expect(h.bins.find((b) => b.dbm === -20)?.n).toBe(2)
    expect(h.bins.find((b) => b.dbm === -29)?.zone).toBe("baja")
    expect(h.bins[0].dbm).toBeLessThanOrEqual(-31)
  })
  it("open reports by age and the installation backlog", () => {
    const now = Date.parse("2026-11-22T12:00:00Z")
    const r = (h: number) => ({ ...newReport(), createdAt: new Date(now - h * 3600000).toISOString() })
    expect(reportAges([r(2), r(30), r(100), r(500), { ...r(500), status: "resuelto" as const }], now)).toEqual({ d1: 1, d3: 1, d7: 1, more: 1 })
    const a = (date: string, status = "pendiente" as const) => newAppointment({ kind: "instalacion", date, status })
    const b = installBacklog([a("2026-11-20"), a("2026-11-22"), a("2026-11-22"), a("2026-11-25"), newAppointment({ kind: "visita", date: "2026-11-22" })], "2026-11-22", 7)
    expect(b.overdue).toBe(1)
    expect(b.days.map((d) => d.n)).toEqual([2, 0, 0, 1, 0, 0, 0])
  })
})
