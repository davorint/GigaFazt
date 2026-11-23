import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { newReport } from "../reports/model"
import { newSite, newTower } from "../sites/model"
import { demoSet } from "./dashboard-demo"
import { demoCarriers } from "./tablero2-demo"
import { compareRows, faultMatrix, faultsPer10, payPrints, revenueTree, type Leaf, type TreeNode } from "./tablero2-x"

const net = (plan: string, monthly: number, p: Partial<ReturnType<typeof newService>> = {}) => newService("internet", { plan, monthly, status: "activo", start: "2026-01-10", ...p })
const leaves = (n: TreeNode | Leaf): Leaf[] => ("children" in n ? n.children.flatMap(leaves) : [n])

describe("Tablero 2, fourth round", () => {
  it("revenue tree: deployment → tower → client, value = live services, suspended still counted", () => {
    const a = newTower({ name: "A" })
    const b = newTower({ name: "B" })
    const two = newSite({ name: "Dos", towers: [a, b] })
    const one = newSite({ name: "Uno", towers: [newTower({ name: "Única" })] })
    const tree = revenueTree(
      [two, one],
      [
        newClient({ siteId: two.id, towerId: a.id, services: [net("200M", 396), newService("iptv", { monthly: 250, status: "activo" })] }),
        newClient({ siteId: two.id, towerId: b.id, services: [net("1G", 596, { status: "suspendido" })] }),
        newClient({ siteId: one.id, towerId: "otra", services: [net("500M", 496)] }),
        newClient({ siteId: one.id, services: [net("500M", 496, { status: "cancelado" })] }),
        newClient({ siteId: "", services: [net("200M", 396)] }),
      ],
      [],
      "2026-11-20"
    )
    expect(tree.children).toHaveLength(3)
    const dos = tree.children.find((n) => "name" in n && n.name === "Dos") as TreeNode
    expect(dos.children.map((t) => (t as TreeNode).name).sort()).toEqual(["A", "B"])
    expect(leaves(dos).map((l) => l.value).sort()).toEqual([596, 646])
    expect(leaves(dos).find((l) => l.value === 596)?.tone).toBe("suspendido")
    const uno = tree.children.find((n) => "name" in n && n.name === "Uno") as TreeNode
    expect((uno.children[0] as TreeNode).name).toBe("")
    expect(leaves(tree)).toHaveLength(4)
  })

  it("fault matrix: deployments × kinds in the window, discarded and old left out", () => {
    const s = newSite({ name: "Uno" })
    const now = Date.parse("2026-11-20T12:00:00Z")
    const r = (category: "lento" | "intermitente" | "wifi" | "tv", daysAgo: number, p = {}) => newReport({ siteId: s.id, category, createdAt: new Date(now - daysAgo * 864e5).toISOString(), ...p })
    const m = faultMatrix([r("lento", 1), r("intermitente", 2), r("wifi", 3), r("tv", 100), r("lento", 1, { status: "descartado" }), r("tv", 4, { siteId: "" })], [s], now)
    expect(m.sites.map((x) => x.name)).toEqual(["Uno", ""])
    expect(m.counts[0]).toEqual([0, 2, 1, 0])
    expect(m.counts[1]).toEqual([0, 0, 0, 1])
    expect(m.total).toBe(4)
  })

  it("payment fingerprint: day of the month vs months with us; punctual new vs old", () => {
    const fresh = newClient({ services: [net("200M", 396, { start: "2026-10-01" })] })
    const old = newClient({ services: [net("200M", 396, { start: "2025-01-01" })] })
    const p = payPrints([newPayment({ clientId: fresh.id, date: "2026-11-15" }), newPayment({ clientId: fresh.id, date: "2026-10-03" }), newPayment({ clientId: old.id, date: "2026-11-02" }), newPayment({ clientId: old.id, date: "2024-12-02" })], [fresh, old], "2026-11-20")
    expect(p.points).toHaveLength(3)
    expect(p.fresh).toBe(0.5)
    expect(p.loyal).toBe(1)
    expect(p.points.find((x) => x.day === 2)?.tenure).toBeGreaterThan(21)
  })

  it("compare rows: missing measures stay null; faults per 10 clients", () => {
    expect(faultsPer10(3, 60)).toBe(0.5)
    expect(faultsPer10(3, 0)).toBeNull()
    const rows = compareRows([{ id: "a", name: "A" }, { id: "b", name: "B" }], (id) => (id === "a" ? { clients: 10, latency: 4 } : {}))
    expect(rows).toHaveLength(1)
    expect(rows[0].values).toMatchObject({ clients: 10, latency: 4, use: null })
  })

  it("the simulated operator fills the horizon: a week hour by hour, one deployment over 80 % at its peak", () => {
    const set = demoSet("2026-11-22")
    const f = demoCarriers(set, Date.parse("2026-11-22T18:00:00Z"))
    expect(f.traffic).toHaveLength(5)
    expect(f.traffic[0].hours).toHaveLength(7 * 24)
    const poniente = f.traffic[2]
    expect(Math.max(...poniente.hours.map((h) => h.down))).toBeGreaterThan(0.8 * 300)
  })
})
