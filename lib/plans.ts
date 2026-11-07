import type { AddOn, Plan } from "./types"
import { placeholder, isPlaceholder, type Maybe } from "./placeholder"

/**
 * Generated from docs/BUSINESS.md. Speeds, technology, segment, ids and the
 * "highlight" flag are concrete values present in the table. Names, prices,
 * promos, fees, terms, includes and SLA are still {{PLACEHOLDER}} and render as
 * visible chips (hard rule #1). Re-sync when BUSINESS.md is filled in.
 */
export const plans: Plan[] = [
  {
    id: "hogar-1g",
    segment: "hogar",
    name: placeholder("hogar-1g.name"),
    downMbps: 1000,
    upMbps: 1000,
    // Owner-provided (chat, 2026-11-06): 1 Gbps entry plan at $599/mes, IVA incl.
    priceMxn: 599,
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractMonths: placeholder("CONTRACT_TERM"),
    technology: "GPON",
    includes: placeholder("hogar-1g.includes"),
  },
  {
    id: "hogar-2-5g",
    segment: "hogar",
    name: placeholder("hogar-2-5g.name"),
    downMbps: 2500,
    upMbps: 2500,
    priceMxn: placeholder("hogar-2-5g.price"),
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractMonths: placeholder("CONTRACT_TERM"),
    technology: "XGS-PON",
    includes: placeholder("hogar-2-5g.includes"),
    highlight: true,
  },
  {
    id: "hogar-10g",
    segment: "hogar",
    name: placeholder("hogar-10g.name"),
    downMbps: 10000,
    upMbps: 10000,
    priceMxn: placeholder("hogar-10g.price"),
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractMonths: placeholder("CONTRACT_TERM"),
    technology: "XGS-PON",
    includes: placeholder("hogar-10g.includes"),
  },
  {
    id: "empresa-1g",
    segment: "empresa",
    name: placeholder("empresa-1g.name"),
    downMbps: 1000,
    upMbps: 1000,
    priceMxn: placeholder("empresa-1g.price"),
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractMonths: placeholder("CONTRACT_TERM"),
    technology: "XGS-PON",
    includes: placeholder("empresa-1g.includes"),
  },
  {
    id: "empresa-dedicado",
    segment: "empresa",
    name: placeholder("empresa-dedicado.name"),
    downMbps: 1000,
    upMbps: 1000,
    maxMbps: 100000,
    priceMxn: null, // "Cotizar" — intentional per BUSINESS.md, not a placeholder.
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractMonths: placeholder("CONTRACT_TERM"),
    technology: "Dedicated",
    includes: placeholder("empresa-dedicado.includes"),
    sla: placeholder("empresa-dedicado.sla"),
  },
]

export const addOns: AddOn[] = [
  { id: "ip-fija", name: placeholder("ip-fija.name"), priceMxn: placeholder("ip-fija.price"), segment: "all" },
  { id: "mesh-node", name: placeholder("mesh-node.name"), priceMxn: placeholder("mesh-node.price"), segment: "hogar" },
  { id: "soporte-prioritario", name: placeholder("soporte-prioritario.name"), priceMxn: placeholder("soporte-prioritario.price"), segment: "all" },
]

export function plansBySegment(segment: Plan["segment"]): Plan[] {
  return plans.filter((p) => p.segment === segment)
}

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id)
}

/** Lowest concrete monthly price for a segment, or a Placeholder if none set. */
export function lowestPrice(segment: Plan["segment"]): Maybe<number> {
  const prices = plansBySegment(segment)
    .map((p) => p.priceMxn)
    .filter((p): p is number => typeof p === "number")
  if (prices.length === 0) return placeholder(`${segment}.lowestPrice`)
  return Math.min(...prices)
}

export { isPlaceholder }
