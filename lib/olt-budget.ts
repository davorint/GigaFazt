/**
 * PON optical budget: the loss between the OLT port and the farthest ONT, against what each module class allows.
 * Splitter losses and class budgets are sourced (lib/olt-kb); fiber, connector and splice losses are typical values
 * the user can change (the page says so).
 */
import { BUDGETS, SPLITTERS } from "./olt-kb"

export type BudgetInput = {
  /** Fiber from the OLT to the farthest ONT, km. */
  km: number
  /** Splitter ratios in cascade (e.g. [8, 8] = 1:64 in two stages). */
  splitters: number[]
  connectors: number
  splices: number
  /** dB per km (upstream 1310 nm is the worst case). */
  fiberDb: number
  connectorDb: number
  spliceDb: number
  /** Margin kept for aging, repairs and bends, dB. */
  marginDb: number
}

/** Common planning values; the page labels them as typical, not as facts. */
export const DEFAULT_BUDGET: BudgetInput = { km: 2, splitters: [8, 8], connectors: 4, splices: 4, fiberDb: 0.35, connectorDb: 0.5, spliceDb: 0.1, marginDb: 3 }

export type BudgetResult = {
  splitDb: number
  fiberDb: number
  connectorDb: number
  spliceDb: number
  /** Loss without the margin. */
  total: number
  /** 1:N overall split. */
  ratio: number
  /** Per class: budget − total − margin (≥ 0 = fits with the margin). */
  classes: { id: string; budget: number; spare: number; verdict: "ok" | "tight" | "no" }[]
  /** Cheapest class that fits with the margin, null if none. */
  pick: string | null
}

const round = (x: number) => Math.round(x * 10) / 10

export function splitterLoss(ratio: number): number | null {
  return SPLITTERS.find((s) => s.ratio === ratio)?.loss.v ?? null
}

export function opticBudget(i: BudgetInput): BudgetResult {
  const splitDb = i.splitters.reduce((a, r) => a + (splitterLoss(r) ?? 0), 0)
  const fiberDb = Math.max(0, i.km) * Math.max(0, i.fiberDb)
  const connectorDb = Math.max(0, i.connectors) * Math.max(0, i.connectorDb)
  const spliceDb = Math.max(0, i.splices) * Math.max(0, i.spliceDb)
  const total = splitDb + fiberDb + connectorDb + spliceDb
  const classes = BUDGETS.map((b) => {
    const spare = b.budget.v - total - Math.max(0, i.marginDb)
    // Fits with the margin = ok; fits only by eating into the margin = tight; over the budget = no.
    const verdict: "ok" | "tight" | "no" = spare >= 0 ? "ok" : b.budget.v - total >= 0 ? "tight" : "no"
    return { id: b.id, budget: b.budget.v, spare: round(spare), verdict }
  })
  return {
    splitDb: round(splitDb),
    fiberDb: round(fiberDb),
    connectorDb: round(connectorDb),
    spliceDb: round(spliceDb),
    total: round(total),
    ratio: i.splitters.reduce((a, r) => a * r, 1),
    classes,
    pick: classes.find((c) => c.verdict === "ok")?.id ?? null,
  }
}
