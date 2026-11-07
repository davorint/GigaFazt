import type { Company } from "./types"
import { placeholder } from "./placeholder"

/**
 * Generated from docs/BUSINESS.md. Every field below is still a {{PLACEHOLDER}}
 * in BUSINESS.md, so it renders as a visible "POR DEFINIR" chip (hard rule #1).
 * Re-sync this file when BUSINESS.md is filled in.
 */
export const company: Company = {
  name: placeholder("COMPANY_NAME"),
  logo: placeholder("LOGO"),
  domain: placeholder("DOMAIN"),
  whatsapp: placeholder("WHATSAPP"),
  salesPhone: placeholder("SALES_PHONE"),
  salesEmail: placeholder("SALES_EMAIL"),
  regulatory: placeholder("REGULATORY"),
  yearsOperating: placeholder("YEARS_OPERATING"),
  network: {
    kmFiber: placeholder("KM_FIBER"),
    pops: placeholder("POPS"),
    /** "More than" figure: active clients (owner, 2026-11-07). */
    clients: 600,
    accessTech: placeholder("ACCESS_TECH"),
    wavelengths: placeholder("WAVELENGTHS"),
    backbone: placeholder("BACKBONE"),
    fiberTypes: placeholder("FIBER_TYPES"),
    certifications: placeholder("CERTIFICATIONS"),
    statusProvider: placeholder("STATUS_PROVIDER"),
  },
  terms: {
    installFeeMxn: 0, // free installation (owner, 2026-11-07)
    contractTerm: placeholder("CONTRACT_TERM"),
    installDays: placeholder("INSTALL_DAYS"),
    guarantee: placeholder("GUARANTEE"),
    noHiddenFees: placeholder("NO_HIDDEN_FEES"),
    localSupport: placeholder("LOCAL_SUPPORT"),
    showPrices: placeholder("SHOW_PRICES"),
  },
  integrations: {
    geocoder: placeholder("GEOCODER"),
    mapTiles: placeholder("MAP_TILES"),
    crmWebhook: placeholder("CRM_WEBHOOK"),
    analytics: placeholder("ANALYTICS"),
  },
  legal: {
    privacyUrl: placeholder("PRIVACY_NOTICE_URL"),
    termsUrl: placeholder("TERMS_URL"),
  },
  policies: {
    cancellation: placeholder("CANCELLATION_POLICY"),
    moving: placeholder("MOVING_POLICY"),
    staticIp: placeholder("STATIC_IP"),
    supportHours: placeholder("SUPPORT_HOURS"),
  },
  social: placeholder("SOCIAL"),
}
