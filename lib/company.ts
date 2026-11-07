import type { Company } from "./types"
import { placeholder } from "./placeholder"

/**
 * Generated from docs/BUSINESS.md. Every field below is still a {{PLACEHOLDER}}
 * in BUSINESS.md, so it renders as a visible "POR DEFINIR" chip (hard rule #1).
 * Re-sync this file when BUSINESS.md is filled in.
 */
export const company: Company = {
  name: "GigaFazt", // owner, 2026-11-07
  logo: placeholder("LOGO"),
  domain: "gigafazt.com", // owner, 2026-11-07 (enables indexing + canonical URLs)
  whatsapp: "+52 5540947678", // owner, 2026-11-07 (10 digits kept together)
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
    monitoring24h: true, // owner, 2026-11-07: staff look after the network, servers and systems 24 h
  },
  terms: {
    installFeeMxn: 0, // free installation (owner, 2026-11-07)
    contractTerm: null, // no minimum term (owner, 2026-11-07)
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
    officeHours: { open: 8, close: 18 }, // owner, 2026-11-07: Monday to Friday, 8:00 to 18:00
  },
  social: placeholder("SOCIAL"),
}
