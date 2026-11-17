/**
 * Internal pages (/mikrotik-optimo for the ideal guide of a deployment, /mikrotik for the MikroTik expert scripts, /calculadora for the
 * calculators and simulators, /olt for the Huawei OLT knowledge base): open (no password, owner 2026-11-15) but never
 * linked from the public site, not in the sitemap and noindex. They are served
 * from the Spanish route, and any capitalization (/MikroTik, /ES/CALCULADORA)
 * maps to the lowercase route.
 */

export const INTERNAL_PAGES = ["mikrotik-optimo", "mikrotik", "calculadora", "olt"] as const
/** Other spellings that open an internal page. */
const ALIASES: Record<string, (typeof INTERNAL_PAGES)[number]> = { "mikrotik-optimal": "mikrotik-optimo" }

export type InternalMatch = {
  /** Where to rewrite, or null when the path is already the canonical route. */
  rewriteTo: string | null
}

/**
 * Matches /mikrotik, /mikrotik/…, its RSC/segment variants (/mikrotik.rsc…)
 * and the locale-prefixed route it is served from (/es/mikrotik), in any case.
 */
export function matchInternal(pathname: string): InternalMatch | null {
  const names: [string, string][] = [...INTERNAL_PAGES.map((p): [string, string] => [p, p]), ...Object.entries(ALIASES)]
  for (const [name, page] of names) {
    const root = new RegExp(`^/${name}(?=$|[/.])(.*)$`, "i").exec(pathname)
    if (root) return { rewriteTo: `/es/${page}${root[1]}` }
    const local = new RegExp(`^/([a-z]{2})/${name}(?=$|[/.])(.*)$`, "i").exec(pathname)
    if (local) {
      const canonical = `/${local[1].toLowerCase()}/${page}${local[2]}`
      return { rewriteTo: canonical === pathname ? null : canonical }
    }
  }
  return null
}

/** Headers for every internal response: never indexed, URL not sent onward. */
export const INTERNAL_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Referrer-Policy": "no-referrer",
}
