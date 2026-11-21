/**
 * WispDavor's pages (owner, 2026-11-21: "replicate wisphub", "organize the project in subfolders"): the hub at
 * /interno/software/wispdavor and one subfolder per module. Phase 1: cortes (cut-offs and reconnections), portal
 * (clients' private links), avisos (WhatsApp notices), mapa (clients by deployment). No imports: lib/internal-pages
 * reads these to canonicalize addresses. Phase 2: pagos (Stripe: card, OXXO, SPEI, card auto-pay) and facturas (CFDI with
 * Facturama). Phase 3: routers (live control: each MikroTik pulls its actions), trafico (traffic per client), hotspot
 * (common-area Wi-Fi vouchers). Phase 4: monitoreo (sessions, carrier and ONT pings, outages).
 */
export const WISPDAVOR_PAGES = ["cortes", "portal", "avisos", "mapa", "pagos", "facturas", "routers", "trafico", "hotspot", "monitoreo"] as const
export type WispPage = (typeof WISPDAVOR_PAGES)[number]
