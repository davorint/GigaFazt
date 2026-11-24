import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { newReport } from "../reports/model"
import { newSite, newTower } from "../sites/model"
import { dodge, lightRows, recovered, repairLanes, revenueStreams, skyline, statusFlows, tenure } from "./tablero2-more"
import { demoSet } from "./dashboard-demo"

const net = (plan: string, monthly: number, p: Partial<ReturnType<typeof newService>> = {}) => newService("internet", { plan, monthly, status: "activo", start: "2026-01-10", ...p })

describe("Tablero 2, second round", () => {
  it("revenue streams per plan and month, slowest plan first, TV after; a fifth stream folds into Otros", () => {
    const clients = [
      newClient({ services: [net("200M", 396), newService("iptv", { monthly: 250, status: "activo", start: "2026-01-10" })] }),
      newClient({ services: [net("1G", 596, { start: "2026-10-02" })] }),
      newClient({ services: [net("500M", 496, { status: "cancelado", cancelledAt: "2026-10-15" })] }),
    ]
    const s = revenueStreams(clients, ["2026-09", "2026-10", "2026-11"])
    expect(s.keys).toEqual(["200M", "500M", "1G", "__tv"])
    expect(s.rows[0].values).toEqual({ "200M": 396, "500M": 496, "1G": 0, __tv: 250 })
    expect(s.rows[2].values).toEqual({ "200M": 396, "500M": 0, "1G": 596, __tv: 250 })
    const five = revenueStreams([...clients, newClient({ services: [net("100M", 296), newService("otro", { monthly: 50, status: "activo", start: "2026-01-01" })] })], ["2026-11"])
    expect(five.keys).toHaveLength(4)
    expect(five.keys.at(-1)).toBe("__otros")
    expect(Object.values(five.rows[0].values).reduce((a, b) => a + b, 0)).toBe(396 + 250 + 596 + 296 + 50)
  })

  it("status flows: standing each month, the month it left as baja, then gone; recovery of the late", () => {
    const today = "2026-11-20"
    const late = newClient({ billingFrom: "2026-09", services: [net("200M", 396, { start: "2026-09-01" })] })
    const gone = newClient({ billingFrom: "2026-09", services: [net("200M", 396, { start: "2026-09-01", status: "cancelado", cancelledAt: "2026-10-20" })] })
    const pays = [newPayment({ clientId: late.id, date: "2026-09-02", amount: 396 }), newPayment({ clientId: late.id, date: "2026-11-15", amount: 792 }), newPayment({ clientId: gone.id, date: "2026-09-02", amount: 396 }), newPayment({ clientId: gone.id, date: "2026-10-02", amount: 396 })]
    const f = statusFlows([late, gone], pays, ["2026-09", "2026-10", "2026-11"], today)
    expect(f.counts[0]).toMatchObject({ "al-corriente": 2 })
    // Cancelled on Oct 20: October is its "baja", November it's gone.
    expect(f.counts[1]).toMatchObject({ atrasado: 1, baja: 1 })
    expect(f.counts[2]).toMatchObject({ "al-corriente": 1, baja: 0 })
    expect(f.links).toContainEqual({ from: 1, a: "atrasado", b: "al-corriente", n: 1 })
    expect(f.links).toContainEqual({ from: 0, a: "al-corriente", b: "baja", n: 1 })
    expect(recovered(f)).toEqual({ late: 1, share: 1 })
  })

  it("skyline: windows per apartment, lit per active client, clients without a tower apart when there are several", () => {
    const one = newSite({ name: "Uno", towers: [newTower({ name: "A", apartments: 20, floors: 5 })] })
    const t1 = newTower({ name: "A", apartments: 10 })
    const two = newSite({ name: "Dos", towers: [t1, newTower({ name: "B", apartments: 10 })] })
    const clients = [newClient({ siteId: one.id, services: [net("200M", 396)] }), newClient({ siteId: two.id, towerId: t1.id, services: [net("200M", 396)] }), newClient({ siteId: two.id, services: [net("200M", 396)] }), newClient({ siteId: one.id, services: [net("200M", 396, { status: "cancelado" })] })]
    const s = skyline([one, two], [...clients, newClient({ siteId: one.id, services: [net("200M", 396, { start: "2026-12-01" })] })], "2026-11-20")
    const u = s.find((x) => x.name === "Uno")!
    expect(u.towers[0]).toMatchObject({ floors: 5, cols: 4, lit: 1 })
    expect(u.towers[0].windows).toHaveLength(1)
    const d = s.find((x) => x.name === "Dos")!
    expect(d).toMatchObject({ apartments: 20, active: 2, unassigned: 1 })
    expect(d.towers.map((t) => t.lit)).toEqual([1, 0])
    expect(skyline([one], clients, "2026-11-20")[0].towers[0].windows).toEqual(u.towers[0].windows)
  })

  it("light rows with the drop since the first reading; dodge never overlaps", () => {
    const site = newSite({ name: "Uno" })
    const c = newClient({ siteId: site.id, services: [net("200M", 396, { rxDbm: -23.5, rxHistory: [{ date: "2026-09-01", rx: -20, oltRx: null }] })] })
    const rows = lightRows([site], [c, newClient({ services: [net("1G", 596, { rxDbm: -18 })] })])
    expect(rows.map((r) => r.dots.length)).toEqual([1, 1])
    expect(rows.find((r) => r.id === site.id)!.dots[0]).toMatchObject({ drop: 3.5, status: "bien" })
    const xs = [10, 10, 11, 12, 12, 13, 40]
    const ys = dodge(xs, 4)
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) expect(Math.hypot(xs[i] - xs[j], ys[i] - ys[j])).toBeGreaterThanOrEqual(9)
    expect(ys[6]).toBe(0)
  })

  it("tenure: oldest first, what they pay, still here or not", () => {
    const t = tenure([newClient({ services: [net("1G", 596, { start: "2026-05-01" })] }), newClient({ services: [net("200M", 396, { start: "2025-11-01", status: "cancelado", cancelledAt: "2026-05-01" })] })], [], "2026-11-01")
    expect(t.map((s) => [s.live, s.monthly, s.months])).toEqual([
      [false, 396, 6],
      [true, 596, 6],
    ])
  })

  it("repairs: bars in the window, packed in lanes, open ones run to now, median of the solved", () => {
    const now = Date.parse("2026-11-20T12:00:00Z")
    const r = (h0: number, h1: number | null, category = "lento" as const) => newReport({ category, createdAt: new Date(now - h0 * 3600000).toISOString(), status: h1 === null ? "nuevo" : "resuelto", resolvedAt: h1 === null ? "" : new Date(now - h1 * 3600000).toISOString() })
    const g = repairLanes([r(100, 90), r(95, 80), r(50, 40), r(10, null), r(24 * 90, 24 * 80)], [], now, 60)
    expect(g.bars).toHaveLength(4)
    expect(g.lanes).toBe(2)
    expect(g.bars.find((b) => b.open)?.end).toBe(now)
    expect(g.median).toBe(10)
  })

  it("the simulated operator fills every new chart", () => {
    const a = demoSet("2026-11-22")
    expect(skyline(a.sites, a.clients, "2026-11-22").some((s) => s.towers.length > 1)).toBe(true)
    expect(lightRows(a.sites, a.clients).some((r) => r.dots.some((d) => (d.drop ?? 0) >= 3))).toBe(true)
  })
})
