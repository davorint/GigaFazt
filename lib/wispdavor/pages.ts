/**
 * WispDavor's pages (owner, 2026-11-21: "replicate wisphub", "organize the project in subfolders"): the hub at
 * /interno/software/wispdavor and one subfolder per module. Phase 1: cortes (cut-offs and reconnections), portal
 * (clients' private links), avisos (WhatsApp notices), mapa (clients by deployment). No imports: lib/internal-pages
 * reads these to canonicalize addresses.
 */
export const WISPDAVOR_PAGES = ["cortes", "portal", "avisos", "mapa"] as const
export type WispPage = (typeof WISPDAVOR_PAGES)[number]
