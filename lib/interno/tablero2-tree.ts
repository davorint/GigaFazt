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
 * - Layout (reworked 2026-11-28 for hundreds of clients): d3-voronoi-treemap (power diagrams; every cell convex) of
 *   the focused node's groups only, seeded by the node's id; each cell filled in horizontal bands by status; a
 *   tower's clients as an apartment grid. Pure geometry, tested.
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
 * A deployment with one tower: its clients hang from the deployment itself (no one-cell level to click through).
 * Several towers stay as they are.
 */
export function collapseTowers(root: TreeNode): TreeNode {
  return {
    ...root,
    children: root.children.map((s) => {
      if (isLeaf(s)) return s
      const only = s.children.length === 1 ? s.children[0] : null
      return only && !isLeaf(only) ? { ...s, children: only.children } : s
    }),
  }
}

/** True when the focus holds clients (the apartment grid), not groups (the Voronoi map). */
export const holdsClients = (n: TreeNode) => n.children.length > 0 && n.children.every(isLeaf)

/**
 * The focused node's groups (deployments, or a deployment's towers) as Voronoi cells in the circle (cx, cy, r), area =
 * what each charges a month; empty groups left out. Clients are never cells (owner 2026-11-28: with hundreds of
 * clients on three plans, client cells were a mosaic of equal crumbs); each group is filled by how its money stands
 * (bands) and its clients show as a grid only once inside it.
 */
export function cellLayout(focus: TreeNode, cx: number, cy: number, r: number): Cell[] {
  if (r <= 0) return []
  const groups = focus.children.filter((c): c is TreeNode => !isLeaf(c) && stats(c).value > 0)
  if (!groups.length) return []
  const root = hierarchy<N>({ ...focus, children: groups }, (d) => (d.id === focus.id ? (d as TreeNode).children : undefined))
    .sum((d) => (d.id === focus.id ? 0 : stats(d).value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (!root.value) return []
  voronoiTreemap().clip(circlePoly(cx, cy, r)).prng(seeded(focus.id)).convergenceRatio(0.005).maxIterationCount(80).minWeightRatio(0.01)(root)
  const out: Cell[] = []
  for (const d of root.children ?? []) {
    const poly = ((d as unknown as { polygon?: Pt[] }).polygon ?? []).map(([x, y]) => [x, y] as Pt)
    if (poly.length < 3) continue
    out.push({ id: d.data.id, depth: 1, node: d.data, poly, ...polyShape(poly), top: d.data.id, parent: focus.id })
  }
  return out
}

/** The part of a convex polygon on one side of the horizontal line y = t (below = larger y on screen). */
export function clipY(p: Pt[], t: number, keep: "below" | "above"): Pt[] {
  const inside = (q: Pt) => (keep === "below" ? q[1] >= t : q[1] <= t)
  const out: Pt[] = []
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const ia = inside(a)
    const ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib && b[1] !== a[1]) {
      const k = (t - a[1]) / (b[1] - a[1])
      out.push([a[0] + k * (b[0] - a[0]), t])
    }
  }
  return out
}

/**
 * A cell filled like a tank: horizontal bands from the bottom up, each band's area its part of the total (the first
 * part at the bottom). Parts at zero are left out.
 */
export function bands<K extends string>(poly: Pt[], parts: { key: K; value: number }[]): { key: K; poly: Pt[] }[] {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0)
  const whole = polyShape(poly).area
  if (total <= 0 || whole <= 0 || poly.length < 3) return []
  const ys = poly.map((q) => q[1])
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)]
  // The line with this much of the area below it (bisection: the area below grows as the line rises).
  const lineAt = (share: number) => {
    if (share <= 0) return bottom
    if (share >= 1) return top
    let lo = top
    let hi = bottom
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (polyShape(clipY(poly, mid, "below")).area / whole > share) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const out: { key: K; poly: Pt[] }[] = []
  let acc = 0
  let lower = bottom
  for (const p of parts) {
    if (p.value <= 0) continue
    acc += p.value
    const upper = lineAt(acc / total)
    const band = clipY(clipY(poly, upper, "below"), lower, "above")
    if (band.length >= 3) out.push({ key: p.key, poly: band })
    lower = upper
  }
  return out
}

/** How a status stands in a group's tank, from the bottom up: paid first, then what's still to come in. */
export const BAND_ORDER = ["al-corriente", "sin-cobro", "por-vencer", "atrasado", "suspendido"] as const

/** A group's money by status, in tank order. */
export function moneyParts(s: Stats): { key: (typeof BAND_ORDER)[number]; value: number }[] {
  const v = { "al-corriente": s.paid, "sin-cobro": s.value - s.owed, "por-vencer": s.dueValue, atrasado: s.lateValue, suspendido: s.suspendedValue }
  return BAND_ORDER.map((key) => ({ key, value: v[key] }))
}

/**
 * The clients of a tower as a grid of apartment tiles inside the circle: the biggest square tiles (with `gap`) of which
 * n fit wholly in it, the n nearest the middle, read row by row from the top. Returns the tile side and each tile's top-left corner.
 */
export function tileGrid(n: number, cx: number, cy: number, r: number, gap = 3): { size: number; at: Pt[] } {
  if (n <= 0 || r <= 0) return { size: 0, at: [] }
  const fit = (s: number) => {
    const p = s + gap
    const k = Math.ceil(r / p) + 1
    const at: Pt[] = []
    for (let j = -k; j < k; j++) {
      for (let i = -k; i < k; i++) {
        const x = cx + i * p + gap / 2
        const y = cy + j * p + gap / 2
        const far = Math.max(Math.hypot(x - cx, y - cy), Math.hypot(x + s - cx, y - cy), Math.hypot(x - cx, y + s - cy), Math.hypot(x + s - cx, y + s - cy))
        if (far <= r) at.push([x, y])
      }
    }
    return at
  }
  let lo = 1
  let hi = r
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (fit(mid).length >= n) lo = mid
    else hi = mid
  }
  const size = Math.min(lo, 64)
  const at = fit(size)
  // The n tiles nearest the middle (a round block when there's room to spare), read row by row.
  const mid = (q: Pt) => Math.hypot(q[0] + size / 2 - cx, q[1] + size / 2 - cy)
  const used = [...at].sort((a, b) => mid(a) - mid(b)).slice(0, n).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  return { size, at: used }
}

const TONE_RANK: Record<string, number> = { suspendido: 0, atrasado: 1, "por-vencer": 2, "al-corriente": 3, "sin-cobro": 4 }
const byPlace = new Intl.Collator("es", { numeric: true })

/** Clients in the grid: who owes first (suspended, late, not due yet), then paid; each status by apartment. */
export function tileOrder(leaves: Leaf[]): Leaf[] {
  return [...leaves].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || byPlace.compare(a.place, b.place) || a.id.localeCompare(b.id))
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
