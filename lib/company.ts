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
    clients: placeholder("CLIENTS"),
    accessTech: placeholder("ACCESS_TECH"),
    wavelengths: placeholder("WAVELENGTHS"),
    backbone: placeholder("BACKBONE"),
    fiberTypes: placeholder("FIBER_TYPES"),
    router: placeholder("ROUTER"),
    certifications: placeholder("CERTIFICATIONS"),
    statusProvider: placeholder("STATUS_PROVIDER"),
  },
  terms: {
    installFeeMxn: placeholder("INSTALL_FEE"),
    contractTerm: placeholder("CONTRACT_TERM"),
    installDays: placeholder("INSTALL_DAYS"),
    guarantee: placeholder("GUARANTEE"),
    showPrices: placeholder("SHOW_PRICES"),
  },
  sla: {
    availabilityShared: placeholder("SLA_SHARED"),
    availabilityDedicated: placeholder("SLA_DEDICATED"),
    mttrHours: placeholder("MTTR"),
    credits: placeholder("SERVICE_CREDITS"),
  },
  integrations: {
    geocoder: placeholder("GEOCODER"),
    mapTiles: placeholder("MAP_TILES"),
    crmWebhook: placeholder("CRM_WEBHOOK"),
    analytics: placeholder("ANALYTICS"),
  },
}
