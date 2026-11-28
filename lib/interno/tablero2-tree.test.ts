import { describe, expect, it } from "vitest"
import type { SiteNumbers } from "./numbers"
import { bands, cellLayout, circlePoly, clipY, collapseTowers, findPath, fitInto, holdsClients, leavesOf, margins, marginTone, moneyParts, paidShare, polyShape, seeded, stats, tileGrid, tileOrder, type Pt } from "./tablero2-tree"
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

  it("voronoi map: one convex cell per group in the circle, areas follow the money, never client cells", () => {
    const cells = cellLayout(tree, 200, 200, 180)
    expect(cells.map((c) => c.id).sort()).toEqual(["s:norte", "s:sur"])
    expect(cells.every((c) => c.depth === 1 && c.top === c.id && c.parent === "root")).toBe(true)
    // Inside the circle (a hair of rounding), and the deployments share it by money: Norte 2334, Sur 646.
    expect(cells.every((c) => c.poly.every(([x, y]) => Math.hypot(x - 200, y - 200) <= 180.5))).toBe(true)
    const circle = polyShape(circlePoly(200, 200, 180)).area
    const norte = cells.find((c) => c.id === "s:norte")!
    expect(norte.area / circle).toBeCloseTo(2334 / 2980, 1)
    const xs = norte.poly.map((p) => p[0])
    expect(norte.c[0]).toBeGreaterThan(Math.min(...xs))
    expect(norte.c[0]).toBeLessThan(Math.max(...xs))
    expect(cellLayout(tree, 200, 200, 180).map((c) => c.poly[0])).toEqual(cells.map((c) => c.poly[0]))
    expect(seeded("a")()).toBe(seeded("a")())
    // A deployment: its towers. A tower: no cells (its clients are the grid).
    expect(cellLayout(tree.children[0] as TreeNode, 100, 100, 90).map((c) => c.id).sort()).toEqual(["t:norte:a", "t:norte:b"])
    expect(cellLayout((tree.children[0] as TreeNode).children[0] as TreeNode, 100, 100, 90)).toEqual([])
  })

  it("one-tower deployments hold their clients directly", () => {
    const c = collapseTowers(tree)
    expect((c.children[1] as TreeNode).children.map((x) => x.id)).toEqual(["c6", "c7"])
    expect((c.children[0] as TreeNode).children.map((x) => x.id)).toEqual(["t:norte:a", "t:norte:b"])
    expect(holdsClients(c.children[1] as TreeNode)).toBe(true)
    expect(holdsClients(c.children[0] as TreeNode)).toBe(false)
    expect(stats(c)).toEqual(stats(tree))
  })

  it("bands fill a cell from the bottom by share, covering it exactly", () => {
    const sq: Pt[] = [[0, 0], [0, 100], [100, 100], [100, 0]]
    expect(polyShape(clipY(sq, 25, "below")).area).toBeCloseTo(7500)
    const parts = moneyParts(stats(tree))
    expect(parts.map((p) => p.key)).toEqual(["al-corriente", "sin-cobro", "por-vencer", "atrasado", "suspendido"])
    expect(parts.reduce((a, p) => a + p.value, 0)).toBe(2980)
    const b = bands(sq, parts)
    expect(b.map((x) => x.key)).toEqual(["al-corriente", "sin-cobro", "por-vencer", "atrasado", "suspendido"])
    for (const x of b) expect(polyShape(x.poly).area / 10000).toBeCloseTo(parts.find((p) => p.key === x.key)!.value / 2980, 3)
    // Paid at the bottom (larger y on screen).
    expect(Math.max(...b[0].poly.map((p) => p[1]))).toBeCloseTo(100)
    expect(bands(circlePoly(0, 0, 50), [{ key: "a", value: 0 }, { key: "b", value: 3 }]).map((x) => x.key)).toEqual(["b"])
    expect(bands(sq, [])).toEqual([])
  })

  it("apartment grid: n square tiles wholly in the circle, hundreds fit, who owes first", () => {
    for (const n of [1, 7, 120, 300]) {
      const g = tileGrid(n, 300, 300, 280)
      expect(g.at).toHaveLength(n)
      expect(g.at.every(([x, y]) => [[x, y], [x + g.size, y], [x, y + g.size], [x + g.size, y + g.size]].every(([a, b]) => Math.hypot(a - 300, b - 300) <= 280.01))).toBe(true)
    }
    expect(tileGrid(300, 300, 300, 280).size).toBeGreaterThan(20)
    expect(tileGrid(1, 300, 300, 280).size).toBe(64)
    expect(tileGrid(0, 0, 0, 10).at).toEqual([])
    const order = tileOrder([{ ...leaf("x", 1, "al-corriente"), place: "A · 10" }, { ...leaf("y", 1, "al-corriente"), place: "A · 9" }, leaf("z", 1, "suspendido"), leaf("w", 1, "atrasado")])
    expect(order.map((l) => l.id)).toEqual(["z", "w", "y", "x"])
  })

  it("fitInto: a cell's box fills the circle, centered", () => {
    const f = fitInto([[0, 0], [20, 0], [20, 10], [0, 10]], 100, 100, 50)
    expect(f.k).toBeCloseTo(4.6)
    expect(f.x + f.k * 10).toBeCloseTo(100)
    expect(f.y + f.k * 5).toBeCloseTo(100)
  })
})
