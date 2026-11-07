/**
 * Business offering (owner, 2026-11-07; docs/BUSINESS.md "Business services").
 * Custom fiber installations quoted per project: no prices, no support/SLA
 * commitments (owner chose "none for now"). Copy lives in messages `business.*`.
 */
export const business = {
  /** Top link speed the page may mention ("hasta 10 Gbps"). */
  maxLinkGbps: 10,
  services: ["customInstall", "everyArea", "dedicated", "cabling", "wifi", "equipment"] as const,
  spaces: ["offices", "warehouses", "retail", "buildings"] as const,
  steps: ["talk", "design", "quote", "install"] as const,
}

export type BusinessService = (typeof business.services)[number]
