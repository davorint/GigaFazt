import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { newRoom, newRoomCarrier, newSite } from "../sites/model"
import { cohorts, liveOn, moneyFlow, mrrAt, mrrBridge, networkGroups, payCalendar, payWindow, retentionAt, ringLayout } from "./tablero2"

const net = (plan: string, monthly: number, p: Partial<ReturnType<typeof newService>> = {}) => newService("internet", { plan, monthly, status: "activo", start: "2026-01-10", ...p })

describe("Tablero 2 figures", () => {
  const a = newSite({ name: "Norte", rentMonthly: 500, rooms: [newRoom({ carriers: [newRoomCarrier({ monthly: 300 })] })] })
  const b = newSite({ name: "Sur", rentMonthly: 2000 })

  it("money flow: plans into deployments, out as building, links and what's left; a loss is fed by Faltante", () => {
    const clients = [
      newClient({ siteId: a.id, services: [net("200M", 396), newService("iptv", { monthly: 250, status: "activo" })] }),
      newClient({ siteId: a.id, services: [net("1G", 596)] }),
      newClient({ siteId: b.id, services: [net("200M", 396)] }),
      newClient({ siteId: "", services: [net("500M", 496)] }),
      newClient({ siteId: a.id, services: [net("1G", 596, { status: "cancelado" })] }),
      // A scheduled install isn't income yet.
      newClient({ siteId: a.id, services: [net("1G", 596, { start: "2026-11-28" })] }),
    ]
    const f = moneyFlow([a, b], clients, "2026-11-20")
    const v = (s: string, t: string) => f.links.find((l) => l.source === s && l.target === t)?.value
    expect(v("p:200M", `s:${a.id}`)).toBe(396)
    expect(v("p:tv", `s:${a.id}`)).toBe(250)
    expect(v(`s:${a.id}`, "c:edificio")).toBe(500)
    expect(v(`s:${a.id}`, "c:enlaces")).toBe(300)
    expect(v(`s:${a.id}`, "c:utilidad")).toBe(396 + 250 + 596 - 800)
    expect(v("p:faltante", `s:${b.id}`)).toBe(2000 - 396)
    expect(v("s:", "c:utilidad")).toBe(496)
    expect(f.income).toBe(396 + 250 + 596 + 396 + 496)
    expect(f.costs).toBe(2800)
    expect(f.profit).toBe(f.income - f.costs)
    // Every deployment's bands balance: in = out.
    for (const n of f.nodes.filter((x) => x.kind === "site")) {
      const sum = (k: "source" | "target") => f.links.filter((l) => l[k] === n.id).reduce((x, l) => x + l.value, 0)
      expect(sum("target")).toBeCloseTo(sum("source"))
    }
  })

  it("money flow = the MRR: suspended services count, dated prices", () => {
    const clients = [newClient({ siteId: a.id, services: [net("200M", 396, { status: "suspendido" })] }), newClient({ siteId: a.id, services: [net("500M", 596, { priceHistory: [{ until: "2026-11", monthly: 496 }] })] })]
    const f = moneyFlow([a], clients, "2026-11-20")
    expect(f.income).toBe(396 + 496)
    expect(f.income).toBe(clients.reduce((x, c) => x + mrrAt(c, "2026-11", "2026-11-20"), 0))
  })

  it("MRR bridge: new, more, less and lost per client add up", () => {
    const clients = [
      newClient({ services: [net("200M", 396, { start: "2026-09-03" })] }),
      newClient({ services: [net("200M", 496, { start: "2026-03-03", priceHistory: [{ until: "2026-09", monthly: 396 }] })] }),
      newClient({ services: [net("1G", 596, { start: "2026-03-03", status: "cancelado", cancelledAt: "2026-10-15" })] }),
      newClient({ services: [net("500M", 496, { start: "2026-03-03" })] }),
    ]
    const br = mrrBridge(clients, "2026-08", "2026-11")
    expect(br).toMatchObject({ start: 396 + 596 + 496, added: 396, more: 100, less: 0, lost: 596, end: 396 + 496 + 496 })
    expect(br.start + br.added + br.more - br.less - br.lost).toBeCloseTo(br.end)
    expect(br.counts).toEqual({ added: 1, more: 1, less: 0, lost: 1 })
    // Up to today, an install scheduled later this month isn't in "Hoy" yet.
    const soon = [newClient({ services: [net("1G", 596, { start: "2026-11-28" })] })]
    expect(mrrBridge(soon, "2026-10", "2026-11", "2026-11-20").end).toBe(0)
    expect(mrrBridge(soon, "2026-10", "2026-11").end).toBe(596)
  })

  it("live on a day: started, not cancelled by then; suspended counts", () => {
    expect(liveOn(net("1G", 596, { start: "2026-11-28" }), "2026-11-20")).toBe(false)
    expect(liveOn(net("1G", 596, { status: "suspendido" }), "2026-11-20")).toBe(true)
    expect(liveOn(net("1G", 596, { status: "cancelado", cancelledAt: "2026-11-25" }), "2026-11-20")).toBe(true)
    expect(liveOn(net("1G", 596, { status: "cancelado", cancelledAt: "2026-11-05" }), "2026-11-20")).toBe(false)
  })

  it("cohorts: share still with service each month after joining, null for the future", () => {
    const months = ["2026-09", "2026-10", "2026-11"]
    const clients = [
      newClient({ services: [net("200M", 396, { start: "2026-09-02" })] }),
      newClient({ services: [net("200M", 396, { start: "2026-09-20", status: "cancelado", cancelledAt: "2026-10-05" })] }),
      newClient({ services: [net("1G", 596, { start: "2026-11-01" })] }),
    ]
    const c = cohorts(clients, months)
    expect(c[0]).toEqual({ month: "2026-09", size: 2, cells: [1, 0.5, 0.5] })
    expect(c[1]).toEqual({ month: "2026-10", size: 0, cells: [null, null, null] })
    expect(c[2]).toEqual({ month: "2026-11", size: 1, cells: [1, null, null] })
    expect(retentionAt(c, 1)).toBe(0.5)
  })

  it("network groups: live clients by deployment, suspended over late, calm first", () => {
    const today = "2026-11-20"
    const late = newClient({ siteId: a.id, billingFrom: "2026-10", services: [net("200M", 396, { start: "2026-10-01" })] })
    const paid = newClient({ siteId: a.id, billingFrom: "2026-11", services: [net("500M", 496, { start: "2026-11-01" })] })
    const sus = newClient({ siteId: a.id, services: [net("1G", 596, { status: "suspendido" })] })
    const gone = newClient({ siteId: b.id, services: [net("1G", 596, { status: "cancelado" })] })
    const g = networkGroups([a, b], [sus, late, paid, gone], [newPayment({ clientId: paid.id, date: "2026-11-01", amount: 496 })], today)
    expect(g).toHaveLength(1)
    expect(g[0].clients.map((c) => c.tone)).toEqual(["al-corriente", "atrasado", "suspendido"])
    const soon = newClient({ siteId: b.id, services: [net("1G", 596, { start: "2026-11-28" })] })
    expect(networkGroups([a, b], [soon], [], today)).toHaveLength(0)
  })

  it("ring layout: discs on one circle, inside the square, never overlapping", () => {
    const r = ringLayout([70, 46, 38, 24, 10, 1], 600)
    expect(r.discs[0].angle).toBeCloseTo(-Math.PI / 2)
    for (const d of r.discs) {
      expect(d.x - d.r).toBeGreaterThanOrEqual(0)
      expect(d.x + d.r).toBeLessThanOrEqual(600)
      expect(d.y - d.r).toBeGreaterThanOrEqual(0)
    }
    for (let i = 0; i < r.discs.length; i++)
      for (let j = i + 1; j < r.discs.length; j++) {
        const p = r.discs[i]
        const q = r.discs[j]
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(p.r + q.r)
      }
    expect(r.discs[0].dots).toHaveLength(70)
  })

  it("payment calendar from a Monday, and the busiest run of days", () => {
    const pays = [newPayment({ date: "2026-11-02", amount: 396 }), newPayment({ date: "2026-11-02", amount: 496 }), newPayment({ date: "2026-11-03", amount: 396 }), newPayment({ date: "2026-10-28", amount: 1 })]
    const c = payCalendar(pays, "2026-11-20", 2)
    expect(c.days[0].day).toBe("2026-11-09")
    expect(c.total).toBe(0)
    const w = payCalendar(pays, "2026-11-20", 4)
    expect(w.days[0].day).toBe("2026-10-26")
    expect(w.days.find((d) => d.day === "2026-11-02")).toEqual({ day: "2026-11-02", n: 2, amount: 892 })
    expect(w.byDayOfMonth[1]).toBe(2)
    expect(payWindow(w.byDayOfMonth, 0.5)).toEqual({ from: 2, to: 2, share: 0.5 })
    // Across the month's end: early payers on the 30th and 31st, the rest on the 1st and 2nd.
    const wrap = Array.from({ length: 31 }, (_, i) => ([0, 1, 29, 30].includes(i) ? 5 : i === 15 ? 1 : 0))
    expect(payWindow(wrap, 0.9)).toEqual({ from: 30, to: 2, share: 20 / 21 })
  })
})
