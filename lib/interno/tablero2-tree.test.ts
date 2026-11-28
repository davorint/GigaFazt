import { describe, expect, it } from "vitest"
import type { SiteNumbers } from "./numbers"
import { findPath, leavesOf, margins, marginTone, paidShare, stats } from "./tablero2-tree"
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

})
