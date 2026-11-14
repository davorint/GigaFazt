/**
 * HTTP Basic Auth for internal pages (/mikrotik). Credentials come from env
 * (MIKROTIK_USER / MIKROTIK_PASS); without them the page is treated as absent.
 * Runs in the proxy, so only Web APIs (no node:crypto).
 */

export const INTERNAL_PAGES = ["mikrotik"] as const

export type InternalMatch = {
  /** Public form (/mikrotik…): rewritten to the Spanish route. */
  rewriteTo: string | null
}

/**
 * Matches /mikrotik, /mikrotik/…, its RSC/segment variants (/mikrotik.rsc…)
 * and the locale-prefixed route it is served from (/es/mikrotik, /en/mikrotik).
 */
export function matchInternal(pathname: string): InternalMatch | null {
  for (const page of INTERNAL_PAGES) {
    const root = new RegExp(`^/${page}(?=$|[/.])(.*)$`).exec(pathname)
    if (root) return { rewriteTo: `/es/${page}${root[1]}` }
    if (new RegExp(`^/[a-z]{2}/${page}(?=$|[/.])`).test(pathname)) return { rewriteTo: null }
  }
  return null
}

export type Credentials = { user: string; pass: string }

export function internalCredentials(env: Record<string, string | undefined> = process.env): Credentials | null {
  const user = env.MIKROTIK_USER
  const pass = env.MIKROTIK_PASS
  return user && pass ? { user, pass } : null
}

/** Parses `Authorization: Basic …` (UTF-8). null when missing or malformed. */
export function parseBasicAuth(header: string | null): Credentials | null {
  if (!header) return null
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header)
  if (!m) return null
  let decoded: string
  try {
    const bin = atob(m[1])
    decoded = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
  const i = decoded.indexOf(":")
  if (i < 0) return null
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) }
}

/** Constant-time string comparison (length is the only thing that leaks). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  const n = Math.max(ea.length, eb.length)
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

export function isAuthorized(header: string | null, expected: Credentials): boolean {
  const given = parseBasicAuth(header)
  if (!given) return false
  // Compare both even if the first fails, so timing doesn't say which one.
  const userOk = safeEqual(given.user, expected.user)
  const passOk = safeEqual(given.pass, expected.pass)
  return userOk && passOk
}

/** Headers for every internal response: never indexed, never cached by shared caches. */
export const INTERNAL_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
}
