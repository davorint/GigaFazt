/**
 * Mapa de ingresos (Tablero 2; owner 2026-11-28: "completely redesign it, breathtaking"; deployment → tower → client).
 * A Voronoi treemap of the monthly recurring revenue (revenueTree in tablero2-x.ts) inside a circle: every cell's area
 * is what it charges a month, nested deployment → tower → client, with a dial around it of how this month's money
 * stands (paid, not due yet, late, suspended) and each deployment's margin after the building and the links (Números'
 * siteNumbers, the same figure as there).
 *
 * - Paid share: the value of the clients up to date (Cobranza "al corriente") over the value of those who owe a charge
 *   ("sin cobro" left out).
 * - Margin: profit ÷ income of the deployment; null without income. Costs not priced (links without a monthly fee)
 *   make it "incomplete".
 * - Layout: d3-voronoi-treemap (power diagrams; every cell convex) of the focused node's descendants in a circle,
 *   seeded by the node's id so the same data always draws the same map. Pure geometry, tested.
 */
import { hierarchy } from "d3-hierarchy"
import { voronoiTreemap } from "d3-voronoi-treemap"
import type { SiteNumbers } from "./numbers"
import type { Leaf, TreeNode } from "./tablero2-x"

type N = TreeNode | Leaf
export const isLeaf = (n: N): n is Leaf => !("children" in n)

export type Stats = { value: number; paid: number; owed: number; clients: number; late: number; suspended: number; due: number; dueValue: number; lateValue: number; suspendedValue: number }

const ZERO: Stats = { value: 0, paid: 0, owed: 0, clients: 0, late: 0, suspended: 0, due: 0, dueValue: 0, lateValue: 0, suspendedValue: 0 }

/** What a node adds up to: its value, the paid share, and its clients (and their money) not due yet, late or suspended. */
export function stats(n: N): Stats {
  if (isLeaf(n)) {
    const v = n.value
    const late = n.tone === "atrasado"
    const susp = n.tone === "suspendido"
    const due = n.tone === "por-vencer"
    return { value: v, paid: n.tone === "al-corriente" ? v : 0, owed: n.tone !== "sin-cobro" ? v : 0, clients: 1, late: late ? 1 : 0, suspended: susp ? 1 : 0, due: due ? 1 : 0, dueValue: due ? v : 0, lateValue: late ? v : 0, suspendedValue: susp ? v : 0 }
  }
  return n.children.map(stats).reduce((a, b) => Object.fromEntries(Object.keys(ZERO).map((k) => [k, a[k as keyof Stats] + b[k as keyof Stats]])) as Stats, ZERO)
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

/** Every client under a node. */
export function leavesOf(n: N): Leaf[] {
  return isLeaf(n) ? [n] : n.children.flatMap(leavesOf)
}

/** A margin's slot: keeps money (10 % or more), about even, or loses money (drawn hatched, not in a status color). */
export function marginTone(m: number | null): "loss" | "even" | "good" | "none" {
  if (m === null) return "none"
  if (m < 0) return "loss"
  if (m < 0.1) return "even"
  return "good"
}

// ── The Voronoi map ─────────────────────────────────────────────────────────

export type Pt = [number, number]

/**
 * One cell: `depth` 1 = the focused node's children, deeper = theirs. `top` = the depth-1 cell it lies in (a
 * deployment at the top level), for hovering and picking a whole group.
 */
export type Cell = { id: string; depth: number; node: N; poly: Pt[]; c: Pt; area: number; top: string; parent: string }

/** A circle as a polygon (counter-clockwise on screen, as d3-voronoi-treemap wants its clip). */
export const circlePoly = (cx: number, cy: number, r: number, n = 120): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((-i / n) * 2 * Math.PI), cy + r * Math.sin((-i / n) * 2 * Math.PI)] as Pt)

/** Area and centroid of a simple polygon (Voronoi cells are convex, so the centroid lies inside). */
export function polyShape(p: Pt[]): { area: number; c: Pt } {
  let a = 0
  let x = 0
  let y = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const k = x0 * y1 - x1 * y0
    a += k
    x += (x0 + x1) * k
    y += (y0 + y1) * k
  }
  if (Math.abs(a) < 1e-9) return { area: 0, c: p[0] ?? [0, 0] }
  return { area: Math.abs(a / 2), c: [x / (3 * a), y / (3 * a)] }
}

/** A small seeded random generator (mulberry32) from a string, so a node always draws the same arrangement. */
export function seeded(key: string): () => number {
  let a = 0x9e3779b9
  for (let i = 0; i < key.length; i++) a = Math.imul(a ^ key.charCodeAt(i), 0x85ebca6b)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The focused node's descendants as nested Voronoi cells in the circle (cx, cy, r): parents before their children,
 * zero-value clients and empty groups left out. Depth 1 = the focus's children.
 */
export function cellLayout(focus: TreeNode, cx: number, cy: number, r: number): Cell[] {
  if (r <= 0) return []
  const root = hierarchy<N>(focus, (d) => (isLeaf(d) ? undefined : d.children.filter((c) => stats(c).value > 0)))
    .sum((d) => (isLeaf(d) ? d.value : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (!root.value) return []
  voronoiTreemap().clip(circlePoly(cx, cy, r)).prng(seeded(focus.id)).convergenceRatio(0.005).maxIterationCount(80).minWeightRatio(0.01)(root)
  const out: Cell[] = []
  for (const d of root.descendants()) {
    if (!d.depth) continue
    const poly = ((d as unknown as { polygon?: Pt[] }).polygon ?? []).map(([x, y]) => [x, y] as Pt)
    if (poly.length < 3) continue
    const top = d.ancestors().find((a) => a.depth === 1) ?? d
    out.push({ id: d.data.id, depth: d.depth, node: d.data, poly, ...polyShape(poly), top: top.data.id, parent: d.parent?.data.id ?? focus.id })
  }
  return out
}

/** The scale and shift that make a polygon's box fill the circle (the camera flying into a cell). */
export function fitInto(poly: Pt[], cx: number, cy: number, r: number): { k: number; x: number; y: number } {
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min((2 * r) / Math.max(1, x1 - x0), (2 * r) / Math.max(1, y1 - y0)) * 0.92
  return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) }
}

/** An SVG path for a polygon. */
export const polyPath = (p: Pt[]) => `M${p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`
