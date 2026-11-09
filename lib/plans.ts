import { speedLabel } from "./format"
import type { AddOn, IncludeId, Plan } from "./types"
import { placeholder, isPlaceholder, type Maybe } from "./placeholder"

/**
 * Generated from docs/BUSINESS.md. One lineup for everyone (owner, 2026-11-06:
 * no Hogar/Empresa split). Speeds, prices, free installation, modems and no minimum term are owner-provided;
 * promos and the 200/500 technology are still {{PLACEHOLDER}} and render as
 * visible chips (hard rule #1). Re-sync when BUSINESS.md is filled in.
 */
export const plans: Plan[] = [
  {
    id: "fibra-200",
    downMbps: 200,
    upMbps: 200,
    priceMxn: 396,
    installFeeMxn: 0, // free installation (owner, 2026-11-07)
    contractMonths: null, // no minimum term (owner, 2026-11-07)
    technology: placeholder("fibra-200.technology"),
    includes: ["wifi6Modem"],
    promo: placeholder("fibra-200.promo"),
  },
  {
    id: "fibra-500",
    downMbps: 500,
    upMbps: 500,
    priceMxn: 496,
    installFeeMxn: 0, // free installation (owner, 2026-11-07)
    contractMonths: null, // no minimum term (owner, 2026-11-07)
    technology: placeholder("fibra-500.technology"),
    includes: ["wifi6Modem"],
    promo: placeholder("fibra-500.promo"),
  },
  {
    id: "fibra-1g",
    downMbps: 1000,
    upMbps: 1000,
    priceMxn: 596,
    installFeeMxn: 0, // free installation (owner, 2026-11-07)
    contractMonths: null, // no minimum term (owner, 2026-11-07)
    technology: "GPON",
    includes: ["wifi7Modem"],
    promo: placeholder("fibra-1g.promo"),
    highlight: true,
  },
]

export const addOns: AddOn[] = [
  {
    id: "tv",
    priceMxn: 250,
    contents: { channels: 350, movies: 3000, series: 600 },
  },
]

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id)
}

export function getAddOn(id: string): AddOn | undefined {
  return addOns.find((a) => a.id === id)
}

export const featuredPlan: Plan = plans.find((p) => p.highlight) ?? plans[plans.length - 1]

/** Lowest concrete monthly price across the lineup, or a Placeholder. */
export function lowestPrice(): Maybe<number> {
  const prices = plans
    .map((p) => p.priceMxn)
    .filter((p): p is number => typeof p === "number")
  if (prices.length === 0) return placeholder("lowestPrice")
  return Math.min(...prices)
}

/**
 * Monthly total for a plan + add-ons. `pending` is true when any part is still
 * a placeholder, so the UI shows the known subtotal plus a visible chip.
 */
export function monthlyTotal(
  planId: string,
  addOnIds: readonly string[]
): { known: number; pending: boolean } {
  const parts: Maybe<number>[] = [
    getPlan(planId)?.priceMxn ?? placeholder(`${planId}.price`),
    ...addOnIds.map((id) => getAddOn(id)?.priceMxn ?? placeholder(`${id}.price`)),
  ]
  let known = 0
  let pending = false
  for (const p of parts) {
    if (isPlaceholder(p)) pending = true
    else known += p
  }
  return { known, pending }
}

/** Slowest and fastest plan as labels ("200 Mbps", "1 Gbps"), for copy. */
export function speedRange(): { min: string; max: string } {
  const speeds = plans.map((p) => p.downMbps)
  return { min: speedLabel(Math.min(...speeds)), max: speedLabel(Math.max(...speeds)) }
}

export { isPlaceholder }

/** Plans that include a given item (e.g. the Wi-Fi 6 modem on 200/500 Mbps). */
export function plansWith(id: IncludeId): Plan[] {
  return plans.filter((p) => !isPlaceholder(p.includes) && p.includes.includes(id))
}

/** The plan that includes the Wi-Fi 7 modem (owner: 1 Gbps only; no brand, no mesh). */
export const wifi7Plan: Plan | undefined = plansWith("wifi7Modem")[0]

/**
 * Terms every plan shares, for short summaries such as meta descriptions:
 * only what the data says (free installation, no minimum term).
 */
export function sharedPlanPerks(): ("freeInstall" | "noTerm")[] {
  const out: ("freeInstall" | "noTerm")[] = []
  if (plans.every((p) => p.installFeeMxn === 0)) out.push("freeInstall")
  if (plans.every((p) => p.contractMonths === null)) out.push("noTerm")
  return out
}
