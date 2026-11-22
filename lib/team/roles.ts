/**
 * Roles (WispDavor phase 14, owner 2026-11-22: "do all"): until now everyone on the team had the same access. Each team
 * account now has a role; admins (the existing `admin` flag) reach everything. The shared team password counts as an
 * admin while no team account exists (nobody can be told apart then), as before.
 *
 * - oficina: everything except managing accounts and the activity log (the default; what everyone had before).
 * - tecnico: field work: agenda, Técnico, clients, reports, deployments, stock, tools, telecom guides, network pages.
 *   Payments read only (balances in Clientes); no accounts payable/receivable, contracts or WhatsApp sending.
 * - cobranza: collections: clients, payments, receivables, reports, agenda, Alta and WispDavor's money pages.
 *   No stock, tools, payables, contracts or network control.
 *
 * Enforced on the server (sync kinds and API areas); pages a role can't open show "Sin acceso" and leave the menu.
 */
import type { SyncKind } from "../sync/protocol"

export const ROLES = ["oficina", "tecnico", "cobranza"] as const
export type Role = (typeof ROLES)[number]
export const DEFAULT_ROLE: Role = "oficina"

export const decodeRole = (v: unknown): Role => (ROLES as readonly unknown[]).includes(v) ? (v as Role) : DEFAULT_ROLE

/** Who is asking: an admin reaches everything; otherwise its role decides. */
export type Access = { admin: boolean; role: Role }

const TECH_KINDS: SyncKind[] = ["surveys", "materials", "providers", "clients", "sites", "tools", "stock", "units", "reports", "notes", "rolls", "toolbuys", "agenda"]
const COBRANZA_KINDS: SyncKind[] = ["clients", "sites", "reports", "payments", "notes", "agenda", "porcobrar"]

/** Kinds a role reads but doesn't change (técnico: payments, so Clientes shows real balances, not everyone owing). */
const READ_ONLY: Record<Exclude<Role, "oficina">, SyncKind[]> = { tecnico: ["payments"], cobranza: [] }

/** The kinds of records a session may sync (read; see kindWritable for changes). */
export function kindAllowed(a: Access, kind: SyncKind): boolean {
  if (a.admin || a.role === "oficina") return true
  return [...(a.role === "tecnico" ? TECH_KINDS : COBRANZA_KINDS), ...READ_ONLY[a.role]].includes(kind)
}

/** The kinds a session may change. */
export function kindWritable(a: Access, kind: SyncKind): boolean {
  if (a.admin || a.role === "oficina") return true
  return kindAllowed(a, kind) && !READ_ONLY[a.role].includes(kind)
}

/** Server areas beyond the synced records. */
export type Area = "whatsapp" | "payments" | "portal" | "files" | "backup" | "weekly" | "team" | "activity"

export function areaAllowed(a: Access, area: Area): boolean {
  if (a.admin) return true
  if (area === "team" || area === "activity") return false
  if (a.role === "oficina") return true
  if (a.role === "cobranza") return area === "whatsapp" || area === "payments" || area === "portal"
  return false
}

/** Admin-only pages. */
const ADMIN_PAGES = ["/interno/admin/usuarios", "/interno/admin/actividad"]

/** Pages (path prefixes under /interno) each role can open; "/interno" alone is the home page. */
const PAGES: Record<Exclude<Role, "oficina">, string[]> = {
  tecnico: [
    "/interno/admin/notas",
    "/interno/admin/despliegues",
    "/interno/admin/agenda",
    "/interno/tecnico",
    "/interno/admin/clientes",
    "/interno/admin/reportes_clientes",
    "/interno/herramientas",
    "/interno/materiales",
    "/interno/equipos-telecom",
    "/interno/software/davorolt",
    "/interno/software/wispdavor/red",
    "/interno/software/wispdavor/monitoreo",
    "/interno/software/wispdavor/mapa",
    "/interno/software/wispdavor/capacidad",
    "/interno/software/wispdavor/trafico",
    "/interno/software/wispdavor/routers",
    "/interno/software/wispdavor/envivo",
    "/interno/software/wispdavor/hotspot",
    "/interno/guias",
  ],
  cobranza: [
    "/interno/admin/notas",
    "/interno/admin/agenda",
    "/interno/admin/clientes",
    "/interno/admin/reportes_clientes",
    "/interno/admin/cuentas-por-cobrar",
    "/interno/software/wispdavor/alta",
    "/interno/software/wispdavor/cortes",
    "/interno/software/wispdavor/portal",
    "/interno/software/wispdavor/avisos",
    "/interno/software/wispdavor/mapa",
    "/interno/software/wispdavor/pagos",
    "/interno/software/wispdavor/facturas",
    "/interno/software/wispdavor/cobranza",
    "/interno/software/wispdavor/contrato",
    "/interno/guias",
  ],
}
/** Hubs every role opens (they list what's inside; each page inside is checked on its own). */
const HUBS = ["/interno", "/interno/admin", "/interno/software", "/interno/software/wispdavor", "/interno/entrar"]

const strip = (p: string) => p.replace(/^\/[a-z]{2}(?=\/interno)/, "").replace(/\/+$/, "").toLowerCase() || "/"
const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`)

export function pageAllowed(a: Access, path: string): boolean {
  const p = strip(path)
  if (a.admin) return true
  if (ADMIN_PAGES.some((x) => under(p, x))) return false
  if (a.role === "oficina") return true
  if (HUBS.includes(p)) return true
  return PAGES[a.role].some((x) => under(p, x))
}
