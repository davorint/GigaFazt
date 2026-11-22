/**
 * WispDavor's pages (owner, 2026-11-21: "replicate wisphub", "organize the project in subfolders"): the hub at
 * /interno/software/wispdavor and one subfolder per module. Phase 1: cortes (cut-offs and reconnections), portal
 * (clients' private links), avisos (WhatsApp notices), mapa (clients by deployment). No imports: lib/internal-pages
 * reads these to canonicalize addresses. Phase 2: pagos (Stripe: card, OXXO, SPEI, card auto-pay) and facturas (CFDI with
 * Facturama). Phase 3: routers (live control: each MikroTik pulls its actions), trafico (traffic per client), hotspot
 * (common-area Wi-Fi vouchers). Phase 4: monitoreo (sessions, carrier and ONT pings, outages). Phase 6: cobranza (the collections funnel). REST (2026-11-21): envivo (one router live over its REST API). Phase 8: red (ONT inventory by OLT port). Phase 12: alta (a new client in one step). Phase 11: tunel (WireGuard to reach routers without a public IP).
 */
export const WISPDAVOR_PAGES = ["alta", "cortes", "portal", "avisos", "mapa", "pagos", "facturas", "routers", "trafico", "hotspot", "monitoreo", "cobranza", "envivo", "red", "tunel"] as const
export type WispPage = (typeof WISPDAVOR_PAGES)[number]
