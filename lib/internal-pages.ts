/**
 * Internal pages, all under /interno (owner, 2026-11-17): /interno lists the tools; /interno/equipos-telecom holds the
 * MikroTik tools (mikrotik: the guide of a deployment, guia, and the expert scripts, scripts), the Huawei OLT knowledge base
 * (olt-huawei) and the calculators and simulators (calculadora); /interno/herramientas the tools we have (en-existencia)
 * and their buying options (compras), /interno/materiales the stock (en-existencia) and the master list with its buying
 * options (compras) (owner, 2026-11-20; old addresses are gone, no redirects); /interno/admin the admin
 * pages (legal: /interno/admin/legal/contratos, owner 2026-11-21). Behind a password (lib/internal-auth.ts; the sign-in page /interno/entrar
 * is the only one open), never linked from the public site, not in the sitemap and noindex. Served from the Spanish
 * route; any capitalization (/INTERNO/Equipos-Telecom/OLT-Huawei) maps to the lowercase route.
 */

import { DAVOROLT_SLUGS } from "./davorolt/catalog"
import { WISPDAVOR_PAGES } from "./wispdavor/pages"

export const INTERNAL_ROOT = "interno"
export const INTERNAL_PAGES = ["levantamientos", "admin", "tecnico", "materiales", "herramientas", "equipos-telecom", "software", "guias", "nuevos_proyectos"] as const
/** The guides (/interno/guias/<page>, owner 2026-11-21). */
export const GUIDE_PAGES = ["utp", "ipv4"] as const
/** The software pages (/interno/software/<page>, owner 2026-11-21). */
export const SOFTWARE_PAGES = ["davorolt", "wispdavor"] as const
/** The tool pages (/interno/herramientas/<page>). */
export const TOOL_PAGES = ["en-existencia", "compras"] as const
/** The material pages (/interno/materiales/<page>). */
export const MATERIAL_PAGES = ["en-existencia", "compras"] as const
/** The network equipment pages (/interno/equipos-telecom/<page>). */
export const TELECOM_PAGES = ["mikrotik", "asternos", "olt-huawei", "calculadora"] as const
/** The MikroTik pages (/interno/equipos-telecom/mikrotik/<page>). */
export const MIKROTIK_PAGES = ["guia", "scripts"] as const
/** The AsterNOS pages (/interno/equipos-telecom/asternos/<page>, owner 2026-11-20). */
export const ASTERNOS_PAGES = ["guia", "scripts", "simulador"] as const
/** The admin area's pages (/interno/admin/<page>). */
export const ADMIN_PAGES = ["tablero", "tablero2", "notas", "despliegues", "clientes", "reportes_clientes", "proveedores", "agenda", "numeros", "usuarios", "actividad", "cuentas-por-pagar", "cuentas-por-cobrar", "legal"] as const
/** The legal pages (/interno/admin/legal/<page>, owner 2026-11-21; building agreements are part of contratos). */
export const LEGAL_PAGES = ["contratos"] as const
/** Other spellings of an admin page. */
const ADMIN_ALIASES: Record<string, (typeof ADMIN_PAGES)[number]> = { notes: "notas", "post-it": "notas", postits: "notas", deployments: "despliegues", "reportes-clientes": "reportes_clientes", reportes: "reportes_clientes", reports: "reportes_clientes", calendario: "agenda", citas: "agenda", "números": "numeros", negocio: "numeros", numbers: "numeros", "por-pagar": "cuentas-por-pagar", "por-cobrar": "cuentas-por-cobrar", "cuentas-pagar": "cuentas-por-pagar", "cuentas-cobrar": "cuentas-por-cobrar", pagar: "cuentas-por-pagar", cobrar: "cuentas-por-cobrar" }
/** The sign-in page: the only internal page served without the password. */
export const LOGIN_PAGE = "entrar"
export const LOGIN_PATH = `/${INTERNAL_ROOT}/${LOGIN_PAGE}`
const KNOWN = new Map<string, string>([...INTERNAL_PAGES.map((p): [string, string] => [p, p]), [LOGIN_PAGE, LOGIN_PAGE], ["nuevos-proyectos", "nuevos_proyectos"], ["proyectos", "nuevos_proyectos"]])

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
    let rest3 = sub2?.[2] ?? ""
    // /interno/admin/legal/<page>
    if (known === "legal") {
      const sub3 = /^\/([^/.]+)(.*)$/.exec(rest3)
      const k3 = sub3 && LEGAL_PAGES.find((p) => p === sub3[1].toLowerCase())
      if (sub3 && k3) rest3 = `/${k3}${sub3[2]}`
    }
    if (sub2 && known) after = `/${known}${rest3}`
  }
  // Under /interno/equipos-telecom, /interno/herramientas, /interno/materiales, /interno/software and /interno/guias too, by its lowercase name only.
  const SUBPAGES: Record<string, readonly string[]> = { "equipos-telecom": TELECOM_PAGES, herramientas: TOOL_PAGES, materiales: MATERIAL_PAGES, software: SOFTWARE_PAGES, guias: GUIDE_PAGES }
  if (page && SUBPAGES[page]) {
    const sub2 = /^\/([^/.]+)(.*)$/.exec(after)
    const name = sub2?.[1].toLowerCase() ?? ""
    const known = sub2 && SUBPAGES[page].find((p) => p === name)
    let rest3 = sub2?.[2] ?? ""
    // /interno/equipos-telecom/<mikrotik|asternos>/<guia|scripts>
    // and /interno/software/<davorolt|wispdavor>/<page>.
    const third: Record<string, readonly string[]> = { mikrotik: MIKROTIK_PAGES, asternos: ASTERNOS_PAGES, davorolt: DAVOROLT_SLUGS, wispdavor: WISPDAVOR_PAGES }
    if (known && third[known]) {
      const sub3 = /^\/([^/.]+)(.*)$/.exec(rest3)
      const k3 = sub3 && third[known].find((p) => p === sub3[1].toLowerCase())
      if (sub3 && k3) rest3 = `/${k3}${sub3[2]}`
    }
    if (sub2 && known) after = `/${known}${rest3}`
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
