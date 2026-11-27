/**
 * Mapa de ingresos (Tablero 2, owner 2026-11-27: "make it look truly cutting edge"; deployment → tower → client).
 * A treemap of the monthly recurring revenue (revenueTree in tablero2-x.ts): a tile's area is what it charges a month,
 * its fill level how much of that is already paid this month, and a deployment's top bar its margin after the
 * building and the links (Números' siteNumbers, the same figure as there).
 *
 * - Paid share: the value of the clients up to date (Cobranza "al corriente") over the value of those who owe a charge
 *   ("sin cobro" left out).
 * - Margin: profit ÷ income of the deployment; null without income. Costs not priced (links without a monthly fee)
 *   make it "incomplete".
 * - Layout: d3's squarified treemap of the focused node's children, each with its own children inside (two levels on
 *   screen; the last level shows the clients alone). Pure geometry, tested.
 */
import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy"
import type { SiteNumbers } from "./numbers"
import type { Leaf, TreeNode } from "./tablero2-x"

type N = TreeNode | Leaf
export const isLeaf = (n: N): n is Leaf => !("children" in n)

export type Stats = { value: number; paid: number; owed: number; clients: number; late: number; suspended: number; due: number }

/** What a node adds up to: its value, the share paid, and how many of its clients are due, late or suspended. */
export function stats(n: N): Stats {
  if (isLeaf(n)) {
    const owes = n.tone !== "sin-cobro"
    return { value: n.value, paid: n.tone === "al-corriente" ? n.value : 0, owed: owes ? n.value : 0, clients: 1, late: n.tone === "atrasado" ? 1 : 0, suspended: n.tone === "suspendido" ? 1 : 0, due: n.tone === "por-vencer" ? 1 : 0 }
  }
  return n.children.map(stats).reduce((a, b) => ({ value: a.value + b.value, paid: a.paid + b.paid, owed: a.owed + b.owed, clients: a.clients + b.clients, late: a.late + b.late, suspended: a.suspended + b.suspended, due: a.due + b.due }), { value: 0, paid: 0, owed: 0, clients: 0, late: 0, suspended: 0, due: 0 })
}

/** Paid ÷ owed (null when nothing is owed). */
export const paidShare = (s: Stats) => (s.owed > 0 ? s.paid / s.owed : null)

export type Margin = { margin: number | null; profit: number; income: number; incomplete: boolean }

/** Each deployment's margin, by id. */
export function margins(rows: SiteNumbers[]): Map<string, Margin> {
  return new Map(rows.map((r) => [r.id, { margin: r.income > 0 ? r.profit / r.income : null, profit: r.profit, income: r.income, incomplete: r.unpricedLinks > 0 }]))
}

/** The node with this id, and the path to it from the root (root first). */
export function findPath(root: TreeNode, id: string): TreeNode[] {
  if (root.id === id) return [root]
  for (const c of root.children) {
    if (isLeaf(c)) continue
    const p = findPath(c, id)
    if (p.length) return [root, ...p]
  }
  return []
}

export type Rect = { x0: number; y0: number; x1: number; y1: number }
export type Tile = Rect & { node: N; depth: 1 | 2; parent: string }

/** Every client under a node. */
export function leavesOf(n: N): Leaf[] {
  return isLeaf(n) ? [n] : n.children.flatMap(leavesOf)
}

/** Header band of a tile with clients inside (its name, amount and paid bar), in px. */
export const HEADER = 30
const PAD = 4

/**
 * The focused node's children (depth 1) and, inside each, all of its clients (depth 2) as a mosaic, in a w × h box.
 * A child keeps a header band when it is tall enough; when the children are the clients themselves they fill the box.
 */
export function layoutLevel(focus: TreeNode, w: number, h: number): Tile[] {
  if (w <= 0 || h <= 0 || !focus.children.length) return []
  const flat: TreeNode = { ...focus, children: focus.children.map((c) => (isLeaf(c) ? c : { ...c, children: leavesOf(c) })) }
  const root = hierarchy<N>(flat, (d) => (isLeaf(d) ? undefined : d.children.filter((c) => (isLeaf(c) ? c.value > 0 : stats(c).value > 0))))
    .sum((d) => (isLeaf(d) ? d.value : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const tm = treemap<N>()
    .tile(treemapSquarify.ratio(1.25))
    .size([w, h])
    .round(true)
    .paddingInner((d) => (d.depth === 0 ? PAD + 2 : 2))
    .paddingOuter((d) => (d.depth === 0 ? 0 : 5))
    .paddingTop((d) => (d.depth === 0 ? 0 : d.depth === 1 && d.children && d.y1 - d.y0 > HEADER * 2 ? HEADER : 5))
  const laid = tm(root) as HierarchyRectangularNode<N>
  const out: Tile[] = []
  for (const c of laid.children ?? []) {
    out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, node: c.data, depth: 1, parent: focus.id })
    for (const g of c.children ?? []) out.push({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, node: g.data, depth: 2, parent: (c.data as TreeNode).id })
  }
  return out
}

/** A margin's slot: keeps money (10 % or more), about even, or loses money (drawn hatched, not in a status color). */
export function marginTone(m: number | null): "loss" | "even" | "good" | "none" {
  if (m === null) return "none"
  if (m < 0) return "loss"
  if (m < 0.1) return "even"
  return "good"
}
