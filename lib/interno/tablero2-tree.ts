/**
 * Mapa de ingresos figures (Tablero 2): what a node of the revenue tree (revenueTree in tablero2-x.ts: deployment →
 * tower → client) adds up to, and each deployment's margin after the building and the links (Números' siteNumbers, the
 * same figure as there). The towers themselves are drawn from lib/interno/buildings.ts (owner 2026-11-28: a 2D tower
 * view replaced the Voronoi map).
 *
 * - Paid share: the value of the clients up to date (Cobranza "al corriente") over the value of those who owe a charge
 *   ("sin cobro" left out).
 * - Margin: profit ÷ income of the deployment; null without income. Costs not priced (links without a monthly fee)
 *   make it "incomplete".
 */
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
