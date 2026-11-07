import type { Maybe } from "./placeholder"

export type StateCode = "CDMX" | "MEX" | "MOR"
export type Technology = "GPON" | "XGS-PON"

/**
 * One lineup for everyone: the owner dropped the Hogar/Empresa split
 * (2026-11-06), so plans carry no segment. Plans are named by their speed.
 */
/**
 * Owner-confirmed inclusions (2026-11-07): 1 Gbps = Wi-Fi 7 modem, 200/500 =
 * Wi-Fi 6 modem; all on loan (comodato) while the service is active.
 */
export type IncludeId = "wifi7Modem" | "wifi6Modem"

export interface Plan {
  id: string
  downMbps: number
  upMbps: number
  /** MXN/month, IVA incl. Placeholder → not yet in BUSINESS.md. */
  priceMxn: Maybe<number>
  promo?: Maybe<{ priceMxn: number; months: number; endsAt: string }>
  installFeeMxn: Maybe<number>
  contractMonths: Maybe<number | null>
  technology: Maybe<Technology>
  /** Included equipment/services; labels come from messages (`plans.include.{id}`). */
  includes: Maybe<IncludeId[]>
  highlight?: boolean
}

export interface AddOn {
  id: string
  /** MXN/month on top of the plan, IVA incl. */
  priceMxn: Maybe<number>
  /** Countable contents shown on the add-on (labels come from messages). */
  contents?: { channels: number; movies: number; series: number }
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
    certifications: Maybe<string>
    statusProvider: Maybe<string>
  }
  terms: {
    installFeeMxn: Maybe<number>
    /** Minimum term in months; null = no minimum term ("sin plazo forzoso"). */
    contractTerm: Maybe<number | null>
    installDays: Maybe<string>
    guarantee: Maybe<string>
    /** Trust-strip claims: shown only when the owner confirms (true). */
    noHiddenFees: Maybe<boolean>
    localSupport: Maybe<boolean>
    showPrices: Maybe<boolean>
  }
  integrations: {
    geocoder: Maybe<string>
    mapTiles: Maybe<string>
    crmWebhook: Maybe<string>
    analytics: Maybe<string>
  }
  /** Legal pages (LFPDPPP privacy notice, terms). */
  legal: {
    privacyUrl: Maybe<string>
    termsUrl: Maybe<string>
  }
  /** Policies answered in the FAQ. */
  policies: {
    cancellation: Maybe<string>
    moving: Maybe<string>
    staticIp: Maybe<string>
    supportHours: Maybe<string>
  }
  social: Maybe<{ label: string; url: string }[]>
}
