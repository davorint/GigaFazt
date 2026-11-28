import { describe, expect, it } from "vitest"
import type { SiteNumbers } from "./numbers"
import { cellLayout, circlePoly, findPath, fitInto, leavesOf, margins, marginTone, paidShare, polyShape, seeded, stats } from "./tablero2-tree"
import type { Leaf, TreeNode } from "./tablero2-x"

const leaf = (id: string, value: number, tone: Leaf["tone"]): Leaf => ({ id, value, tone, place: "", plan: "" })
const tree: TreeNode = {
  id: "root",
  name: "",
  children: [
    {
      id: "s:norte",
      name: "Norte",
      children: [
        { id: "t:norte:a", name: "A", children: [leaf("c1", 596, "al-corriente"), leaf("c2", 396, "atrasado"), leaf("c3", 496, "por-vencer")] },
        { id: "t:norte:b", name: "B", children: [leaf("c4", 846, "suspendido"), leaf("c5", 0, "sin-cobro")] },
      ],
    },
    { id: "s:sur", name: "Sur", children: [{ id: "t:sur:", name: "", children: [leaf("c6", 396, "al-corriente"), leaf("c7", 250, "sin-cobro")] }] },
  ],
}

describe("Mapa de ingresos", () => {
  it("stats: value, paid over owed (sin cobro left out), late / suspended / due", () => {
    const s = stats(tree)
    expect(s).toEqual({ value: 2980, paid: 992, owed: 2730, clients: 7, late: 1, suspended: 1, due: 1, dueValue: 496, lateValue: 396, suspendedValue: 846 })
    expect(paidShare(s)).toBeCloseTo(992 / 2730)
    expect(paidShare(stats({ id: "x", name: "", children: [leaf("f", 250, "sin-cobro")] }))).toBeNull()
  })

  it("margins come from Números (profit ÷ income), flagged when links have no price", () => {
    const row = (id: string, income: number, profit: number, unpricedLinks = 0) => ({ id, name: id, clients: 0, active: 0, apartments: 0, penetration: null, income, building: 0, links: 0, profit, unpricedLinks }) as SiteNumbers
    const m = margins([row("norte", 2000, 600), row("sur", 0, -1500, 1)])
    expect(m.get("norte")).toEqual({ margin: 0.3, profit: 600, income: 2000, incomplete: false })
    expect(m.get("sur")).toEqual({ margin: null, profit: -1500, income: 0, incomplete: true })
    expect([-0.2, 0.05, 0.2, 0.5, null].map(marginTone)).toEqual(["loss", "even", "good", "good", "none"])
  })

  it("finds the path to a node; leaves under a node", () => {
    expect(findPath(tree, "t:norte:b").map((n) => n.id)).toEqual(["root", "s:norte", "t:norte:b"])
    expect(findPath(tree, "nada")).toEqual([])
    expect(leavesOf(tree.children[0]).map((l) => l.id)).toEqual(["c1", "c2", "c3", "c4", "c5"])
  })

  it("voronoi map: nested convex cells in the circle, areas follow the money, the same every time", () => {
    const cells = cellLayout(tree, 200, 200, 180)
    const ids = (d: number) => cells.filter((c) => c.depth === d).map((c) => c.id).sort()
    expect(ids(1)).toEqual(["s:norte", "s:sur"])
    expect(ids(2)).toEqual(["t:norte:a", "t:norte:b", "t:sur:"])
    // Zero-value clients left out; a sin-cobro client with a value stays.
    expect(ids(3)).toEqual(["c1", "c2", "c3", "c4", "c6", "c7"])
    expect(cells.find((c) => c.id === "c4")).toMatchObject({ top: "s:norte", parent: "t:norte:b" })
    // Inside the circle (a hair of rounding), and the deployments share it by money: Norte 2334, Sur 646.
    expect(cells.every((c) => c.poly.every(([x, y]) => Math.hypot(x - 200, y - 200) <= 180.5))).toBe(true)
    const circle = polyShape(circlePoly(200, 200, 180)).area
    const norte = cells.find((c) => c.id === "s:norte")!
    expect(norte.area / circle).toBeCloseTo(2334 / 2980, 1)
    // A centroid sits inside its own (convex) cell's box.
    const xs = norte.poly.map((p) => p[0])
    expect(norte.c[0]).toBeGreaterThan(Math.min(...xs))
    expect(norte.c[0]).toBeLessThan(Math.max(...xs))
    expect(cellLayout(tree, 200, 200, 180).map((c) => c.poly[0])).toEqual(cells.map((c) => c.poly[0]))
    expect(seeded("a")()).toBe(seeded("a")())
    // A tower: its clients alone, depth 1.
    expect(cellLayout((tree.children[0] as TreeNode).children[0] as TreeNode, 100, 100, 90).map((c) => c.depth)).toEqual([1, 1, 1])
  })

  it("fitInto: a cell's box fills the circle, centered", () => {
    const f = fitInto([[0, 0], [20, 0], [20, 10], [0, 10]], 100, 100, 50)
    expect(f.k).toBeCloseTo(4.6)
    expect(f.x + f.k * 10).toBeCloseTo(100)
    expect(f.y + f.k * 5).toBeCloseTo(100)
  })
})
