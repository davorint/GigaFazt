/**
 * Internal pages, all under /interno (owner, 2026-11-17): /interno lists the tools; /interno/equipos-telecom holds the
 * MikroTik guide of a deployment (guia-mikrotik), the expert scripts (scripts-mikrotik), the Huawei OLT knowledge base
 * (olt-huawei) and the calculators and simulators (calculadora); /interno/herramientas the tools we have (en-existencia)
 * and their buying options (compras) (owner, 2026-11-20; old addresses are gone, no redirects); /interno/admin the admin
 * pages. Behind a password (lib/internal-auth.ts; the sign-in page /interno/entrar
 * is the only one open), never linked from the public site, not in the sitemap and noindex. Served from the Spanish
 * route; any capitalization (/INTERNO/Equipos-Telecom/OLT-Huawei) maps to the lowercase route.
 */

export const INTERNAL_ROOT = "interno"
export const INTERNAL_PAGES = ["levantamientos", "admin", "herramientas", "equipos-telecom"] as const
/** The tool pages (/interno/herramientas/<page>). */
export const TOOL_PAGES = ["en-existencia", "compras"] as const
/** The network equipment pages (/interno/equipos-telecom/<page>). */
export const TELECOM_PAGES = ["guia-mikrotik", "scripts-mikrotik", "olt-huawei", "calculadora"] as const
/** The admin area's pages (/interno/admin/<page>). */
export const ADMIN_PAGES = ["notas", "despliegues", "clientes", "reportes_clientes", "proveedores", "materiales", "compras-materiales", "agenda", "numeros", "equipo", "cuentas-por-pagar", "cuentas-por-cobrar", "acuerdos"] as const
/** Other spellings of an admin page. */
const ADMIN_ALIASES: Record<string, (typeof ADMIN_PAGES)[number]> = { notes: "notas", "post-it": "notas", postits: "notas", deployments: "despliegues", "reportes-clientes": "reportes_clientes", reportes: "reportes_clientes", reports: "reportes_clientes", "materiales-compras": "compras-materiales", "opciones-materiales": "compras-materiales", precios: "compras-materiales", calendario: "agenda", citas: "agenda", "números": "numeros", negocio: "numeros", numbers: "numeros", team: "equipo", usuarios: "equipo", cuentas: "equipo", "por-pagar": "cuentas-por-pagar", "por-cobrar": "cuentas-por-cobrar", "cuentas-pagar": "cuentas-por-pagar", "cuentas-cobrar": "cuentas-por-cobrar", pagar: "cuentas-por-pagar", cobrar: "cuentas-por-cobrar", contratos: "acuerdos", edificios: "acuerdos", agreements: "acuerdos" }
/** The sign-in page: the only internal page served without the password. */
export const LOGIN_PAGE = "entrar"
export const LOGIN_PATH = `/${INTERNAL_ROOT}/${LOGIN_PAGE}`
const KNOWN = new Map<string, string>([...INTERNAL_PAGES.map((p): [string, string] => [p, p]), [LOGIN_PAGE, LOGIN_PAGE]])

export type InternalMatch = {
  /** Where to rewrite, or null when the path is already the canonical route. */
  rewriteTo: string | null
  /** The sign-in page (served without the password). */
  open: boolean
}

/**
 * Matches /interno and everything under it, its RSC/segment variants (/interno.rsc, /interno/levantamientos.rsc…) and the
 * locale-prefixed route it is served from (/es/interno/levantamientos), in any case.
 */
export function matchInternal(pathname: string): InternalMatch | null {
  const root = new RegExp(`^/${INTERNAL_ROOT}(?=$|[/.])(.*)$`, "i").exec(pathname)
  const local = root ? null : new RegExp(`^/([a-z]{2})/${INTERNAL_ROOT}(?=$|[/.])(.*)$`, "i").exec(pathname)
  if (!root && !local) return null
  const locale = local ? local[1].toLowerCase() : "es"
  const rest = (root ? root[1] : local![2]) ?? ""
  // The sub-page's name: its known spelling in lowercase; anything else is kept and ends in a 404.
  const sub = /^\/([^/.]+)(.*)$/.exec(rest)
  const page = sub ? KNOWN.get(sub[1].toLowerCase()) : undefined
  let after = sub?.[2] ?? ""
  // Under /interno/admin the second name is canonicalized too (/INTERNO/Admin/Proveedores).
  if (page === "admin") {
    const sub2 = /^\/([^/.]+)(.*)$/.exec(after)
    const name = sub2?.[1].toLowerCase() ?? ""
    const known = sub2 && ((ADMIN_PAGES as readonly string[]).find((p) => p === name) ?? ADMIN_ALIASES[name])
    if (sub2 && known) after = `/${known}${sub2[2]}`
  }
  // Under /interno/equipos-telecom and /interno/herramientas too, by its lowercase name only.
  if (page === "equipos-telecom" || page === "herramientas") {
    const sub2 = /^\/([^/.]+)(.*)$/.exec(after)
    const name = sub2?.[1].toLowerCase() ?? ""
    const known = sub2 && ((page === "herramientas" ? TOOL_PAGES : TELECOM_PAGES) as readonly string[]).find((p) => p === name)
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
