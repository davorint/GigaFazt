/**
 * PON optical budget: the loss between the OLT port and the farthest ONT, against what each module class allows.
 * Splitter losses and class figures are sourced (lib/olt-kb); fiber, connector and splice losses and the ONT's transmit
 * power and overload are typical values the user can change (the page says so).
 *
 * B+/C+/C++ have a published class budget. C+++/C++++ only publish their transmit power and sensitivity, so their budget
 * is the weaker direction: downstream (module minimum transmit − ONT sensitivity) or upstream (ONT minimum transmit −
 * module sensitivity). A stronger transmitter can also overload the ONT on a short, low-loss run.
 */
import { BUDGETS, ONT_SENSITIVITY, SPLITTERS, XGS_ONT_SENSITIVITY, type PonKind } from "./olt-kb"

export type BudgetInput = {
  /** PON type: which module classes are compared. */
  tech: PonKind
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
  /** ONT receiver sensitivity, dBm (EG8145B7-50: −27, Huawei). */
  ontSensitivity: number
  /** ONT minimum transmit power, dBm (typical Class B+ ONT value). */
  ontTx: number
  /** Highest power the ONT receiver takes, dBm (typical Class B+ ONT value). */
  ontOverload: number
}

/**
 * The ONT side per PON type. GPON: the company's EG8145B7-50 (sensitivity, Huawei) with typical Class B+ transmit and
 * overload. XGS-PON: Huawei's EN8145B7Ns sensitivity (datasheet); XG-PON borrows it. 10G transmit power and overload are
 * typical values, labeled as such on the page.
 */
export const ONT_DEFAULTS: Record<PonKind, Pick<BudgetInput, "ontSensitivity" | "ontTx" | "ontOverload">> = {
  gpon: { ontSensitivity: ONT_SENSITIVITY.v, ontTx: 0.5, ontOverload: -8 },
  xgpon: { ontSensitivity: XGS_ONT_SENSITIVITY.v, ontTx: 2, ontOverload: -8 },
  xgspon: { ontSensitivity: XGS_ONT_SENSITIVITY.v, ontTx: 4, ontOverload: -7 },
}

/** Common planning values; the page labels the typical ones as such. */
export const DEFAULT_BUDGET: BudgetInput = {
  tech: "gpon",
  km: 2,
  splitters: [8, 8],
  connectors: 4,
  splices: 4,
  fiberDb: 0.35,
  connectorDb: 0.5,
  spliceDb: 0.1,
  marginDb: 3,
  ...ONT_DEFAULTS.gpon,
}

export type ClassResult = {
  id: string
  budget: number
  /** Which direction sets the budget (computed classes only). */
  limit?: "down" | "up"
  /** budget − total − margin (≥ 0 = fits with the margin). */
  spare: number
  verdict: "ok" | "tight" | "no"
  /** The strongest signal reaching the ONT is above its overload: needs more loss (an attenuator). */
  overload: boolean
  /** Least total loss so the ONT isn't overloaded, dB (null: the class publishes no maximum power). */
  minLoss: number | null
}

export type BudgetResult = {
  splitDb: number
  fiberDb: number
  connectorDb: number
  spliceDb: number
  /** Loss without the margin. */
  total: number
  /** 1:N overall split. */
  ratio: number
  classes: ClassResult[]
  /** Cheapest class that fits with the margin and doesn't overload the ONT, null if none. */
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
  const classes = BUDGETS.filter((b) => b.tech === i.tech).map((b): ClassResult => {
    let budget = b.budget?.v ?? 0
    let limit: "down" | "up" | undefined
    if (!b.budget && b.txMin && b.sensitivity) {
      const down = b.txMin.v - i.ontSensitivity
      const up = i.ontTx - b.sensitivity.v
      budget = Math.min(down, up)
      limit = down <= up ? "down" : "up"
    }
    const spare = budget - total - Math.max(0, i.marginDb)
    // Fits with the margin = ok; fits only by eating into the margin = tight; over the budget = no.
    const verdict: "ok" | "tight" | "no" = spare >= 0 ? "ok" : budget - total >= 0 ? "tight" : "no"
    const minLoss = b.txMax ? b.txMax.v - i.ontOverload : null
    return { id: b.id, budget: round(budget), limit, spare: round(spare), verdict, overload: minLoss !== null && total < minLoss, minLoss: minLoss === null ? null : round(minLoss) }
  })
  return {
    splitDb: round(splitDb),
    fiberDb: round(fiberDb),
    connectorDb: round(connectorDb),
    spliceDb: round(spliceDb),
    total: round(total),
    ratio: i.splitters.reduce((a, r) => a * r, 1),
    classes,
    pick: classes.find((c) => c.verdict === "ok" && !c.overload)?.id ?? null,
  }
}
