/**
 * Business offering (owner, 2026-11-07/08; docs/BUSINESS.md "Business services").
 * Quoted per project: no prices online (they depend on the business's size
 * and usage). Copy lives in messages `business.*`.
 *
 * Internet packages (owner, 2026-11-08): any speed in any package; what
 * separates them is availability. Only Dedicado states an uptime figure (an
 * SLA). No repair times and no service credits are published (owner).
 */
export const business = {
  /** Top link speed the page may mention ("hasta 10 Gbps"). */
  maxLinkGbps: 10,
  services: ["customInstall", "everyArea", "cabling", "wifi", "equipment"] as const,
  spaces: ["offices", "warehouses", "retail", "buildings"] as const,
  steps: ["talk", "design", "quote", "install"] as const,
}

export type BusinessService = (typeof business.services)[number]

export type InternetTier = {
  id: "dedicated" | "enterprise" | "businessInternet"
  /** Monthly availability under contract (SLA), %; only where the owner commits to one. */
  uptimePct: number | null
  /** Bandwidth guarantee: all of it (1:1), a minimum (no figure published, owner), or shared best effort. */
  bandwidth: "full" | "minimum" | "shared"
  support: "monitored247" | "chat247" | "businessHours"
  /** A backup route can be added. */
  backupRoute: boolean
}

/** Highest availability first (owner, 2026-11-08). */
export const INTERNET_TIERS: readonly InternetTier[] = [
  { id: "dedicated", uptimePct: 99.9, bandwidth: "full", support: "monitored247", backupRoute: true },
  { id: "enterprise", uptimePct: null, bandwidth: "minimum", support: "chat247", backupRoute: false },
  { id: "businessInternet", uptimePct: null, bandwidth: "shared", support: "businessHours", backupRoute: false },
]
