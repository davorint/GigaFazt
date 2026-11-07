import type { Maybe } from "./placeholder"

export type Segment = "hogar" | "empresa"
export type StateCode = "CDMX" | "MEX" | "MOR"
export type Technology = "GPON" | "XGS-PON" | "Dedicated"

export interface Plan {
  id: string
  segment: Segment
  name: Maybe<string>
  downMbps: number
  upMbps: number
  /** For dedicated/range tiers, the top of the range (symmetrical). */
  maxMbps?: number
  /** null → "Cotizar" (intentional); Placeholder → price not yet in BUSINESS.md. */
  priceMxn: Maybe<number | null>
  promo?: Maybe<{ priceMxn: number; months: number; endsAt: string }>
  installFeeMxn: Maybe<number | null>
  contractMonths: Maybe<number | null>
  technology: Technology
  includes: Maybe<string[]>
  sla?: Maybe<{ availability: number; mttrHours: number; credits: boolean }>
  highlight?: boolean
}

export interface AddOn {
  id: string
  name: Maybe<string>
  priceMxn: Maybe<number | null>
  segment: Segment | "all"
}

export interface CoverageArea {
  slug: string
  name: string
  state: StateCode
  status: "available" | "planned" | "none"
  eta?: string
}

export interface CoverageResult {
  status: "available" | "planned" | "unavailable"
  area?: CoverageArea
  eta?: string
  planIds?: string[]
  estLatencyMs?: number
}

export interface Company {
  name: Maybe<string>
  logo: Maybe<string>
  domain: Maybe<string>
  whatsapp: Maybe<string>
  salesPhone: Maybe<string>
  salesEmail: Maybe<string>
  regulatory: Maybe<string>
  yearsOperating: Maybe<number>
  network: {
    kmFiber: Maybe<number>
    pops: Maybe<number>
    clients: Maybe<number>
    accessTech: Maybe<string>
    wavelengths: Maybe<string>
    backbone: Maybe<string>
    fiberTypes: Maybe<string>
    router: Maybe<string>
    certifications: Maybe<string>
    statusProvider: Maybe<string>
  }
  terms: {
    installFeeMxn: Maybe<number>
    contractTerm: Maybe<string>
    installDays: Maybe<string>
    guarantee: Maybe<string>
    showPrices: Maybe<boolean>
  }
  sla: {
    availabilityShared: Maybe<number>
    availabilityDedicated: Maybe<number>
    mttrHours: Maybe<number>
    credits: Maybe<string>
  }
  integrations: {
    geocoder: Maybe<string>
    mapTiles: Maybe<string>
    crmWebhook: Maybe<string>
    analytics: Maybe<string>
  }
}
