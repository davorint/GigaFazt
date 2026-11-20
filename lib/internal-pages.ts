/**
 * Internal pages, all under /interno (owner, 2026-11-17): /interno lists the tools; /interno/routers holds the MikroTik
 * guide of a deployment (guia-mikrotik) and the expert scripts (scripts-mikrotik) (owner, 2026-11-20; the old
 * /interno/mikrotik-optimo and /interno/mikrotik redirect there), /interno/admin the providers and the master materials list, /interno/calculadora the calculators
 * and simulators, /interno/olt the Huawei OLT knowledge base. Behind a password (lib/internal-auth.ts; the sign-in
 * page /interno/entrar is the only one open), never linked from the public site, not in the sitemap and noindex. The
 * old addresses (/mikrotik, /olt…) no longer exist. Served from the Spanish route; any capitalization
 * (/INTERNO/MikroTik, /ES/interno/OLT) maps to the lowercase route.
 */

export const INTERNAL_ROOT = "interno"
export const INTERNAL_PAGES = ["levantamientos", "admin", "routers", "calculadora", "olt"] as const
/** The router pages (/interno/routers/<page>). */
export const ROUTER_PAGES = ["guia-mikrotik", "scripts-mikrotik"] as const
/** Other spellings of a router page. */
const ROUTER_ALIASES: Record<string, (typeof ROUTER_PAGES)[number]> = { guia: "guia-mikrotik", guide: "guia-mikrotik", scripts: "scripts-mikrotik", mikrotik: "scripts-mikrotik" }
/** Addresses that moved: they redirect to the new one (bookmarks, old links). */
const MOVED: Record<string, string> = { "mikrotik-optimo": "routers/guia-mikrotik", "mikrotik-optimal": "routers/guia-mikrotik", mikrotik: "routers/scripts-mikrotik" }
/** The admin area's pages (/interno/admin/<page>). */
export const ADMIN_PAGES = ["notas", "despliegues", "clientes", "reportes_clientes", "herramientas", "compras-herramientas", "proveedores", "materiales", "compras-materiales", "agenda", "numeros", "equipo", "cuentas-por-pagar", "cuentas-por-cobrar", "acuerdos"] as const
/** Other spellings of an admin page. */
const ADMIN_ALIASES: Record<string, (typeof ADMIN_PAGES)[number]> = { notes: "notas", "post-it": "notas", postits: "notas", deployments: "despliegues", tools: "herramientas", "reportes-clientes": "reportes_clientes", reportes: "reportes_clientes", reports: "reportes_clientes", "herramientas-compras": "compras-herramientas", "opciones-herramientas": "compras-herramientas", "materiales-compras": "compras-materiales", "opciones-materiales": "compras-materiales", precios: "compras-materiales", calendario: "agenda", citas: "agenda", "números": "numeros", negocio: "numeros", numbers: "numeros", team: "equipo", usuarios: "equipo", cuentas: "equipo", "por-pagar": "cuentas-por-pagar", "por-cobrar": "cuentas-por-cobrar", "cuentas-pagar": "cuentas-por-pagar", "cuentas-cobrar": "cuentas-por-cobrar", pagar: "cuentas-por-pagar", cobrar: "cuentas-por-cobrar", contratos: "acuerdos", edificios: "acuerdos", agreements: "acuerdos" }
/** The sign-in page: the only internal page served without the password. */
export const LOGIN_PAGE = "entrar"
export const LOGIN_PATH = `/${INTERNAL_ROOT}/${LOGIN_PAGE}`
/** Other spellings that open an internal page. */
const ALIASES: Record<string, (typeof INTERNAL_PAGES)[number]> = { router: "routers", mikrotiks: "routers" }
const KNOWN = new Map<string, string>([...INTERNAL_PAGES.map((p): [string, string] => [p, p]), [LOGIN_PAGE, LOGIN_PAGE], ...Object.entries(ALIASES)])

export type InternalMatch = {
  /** Where to rewrite, or null when the path is already the canonical route. */
  rewriteTo: string | null
  /** The sign-in page (served without the password). */
  open: boolean
  /** A page that moved: send the browser here instead (no locale; the query string is added by the proxy). */
  redirectTo?: string
}

/**
 * Matches /interno and everything under it, its RSC/segment variants (/interno.rsc, /interno/olt.rsc…) and the
 * locale-prefixed route it is served from (/es/interno/olt), in any case.
 */
export function matchInternal(pathname: string): InternalMatch | null {
  const root = new RegExp(`^/${INTERNAL_ROOT}(?=$|[/.])(.*)$`, "i").exec(pathname)
  const local = root ? null : new RegExp(`^/([a-z]{2})/${INTERNAL_ROOT}(?=$|[/.])(.*)$`, "i").exec(pathname)
  if (!root && !local) return null
  const locale = local ? local[1].toLowerCase() : "es"
  const rest = (root ? root[1] : local![2]) ?? ""
  // The sub-page's name: its known spelling in lowercase; anything else is kept and ends in a 404.
  const sub = /^\/([^/.]+)(.*)$/.exec(rest)
  const moved = sub ? MOVED[sub[1].toLowerCase()] : undefined
  if (moved) return { rewriteTo: null, open: false, redirectTo: `/${INTERNAL_ROOT}/${moved}${sub![2]}` }
  const page = sub ? KNOWN.get(sub[1].toLowerCase()) : undefined
  let after = sub?.[2] ?? ""
  // Under /interno/admin the second name is canonicalized too (/INTERNO/Admin/Proveedores).
  if (page === "admin") {
    const sub2 = /^\/([^/.]+)(.*)$/.exec(after)
    const name = sub2?.[1].toLowerCase() ?? ""
    const known = sub2 && ((ADMIN_PAGES as readonly string[]).find((p) => p === name) ?? ADMIN_ALIASES[name])
    if (sub2 && known) after = `/${known}${sub2[2]}`
  }
  if (page === "routers") {
    const sub2 = /^\/([^/.]+)(.*)$/.exec(after)
    const name = sub2?.[1].toLowerCase() ?? ""
    const known = sub2 && ((ROUTER_PAGES as readonly string[]).find((p) => p === name) ?? ROUTER_ALIASES[name])
    if (sub2 && known) after = `/${known}${sub2[2]}`
  }
  const tail = sub ? (page ? `/${page}${after}` : rest) : rest
  const canonical = `/${locale}/${INTERNAL_ROOT}${tail}`
  return { rewriteTo: canonical === pathname ? null : canonical, open: page === LOGIN_PAGE }
}

/** Headers for every internal response: never indexed or cached, URL not sent onward. */
export const INTERNAL_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
}
