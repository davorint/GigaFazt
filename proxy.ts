import { NextRequest, NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { prefersSpanishByCountry } from "./lib/geo-locale"
import { INTERNAL_HEADERS, matchInternal, type InternalMatch } from "./lib/internal-pages"

// next-intl locale negotiation. In Next 16 the `middleware` convention was
// renamed to `proxy`; this is the same request-time handler.
const handleI18n = createMiddleware(routing)

/**
 * Internal pages (/mikrotik, /calculadora, /olt): open, noindex. Any capitalization
 * is rewritten to the Spanish route it is served from.
 */
function handleInternal(request: NextRequest, match: InternalMatch): NextResponse {
  const res = match.rewriteTo
    ? NextResponse.rewrite(new URL(`${match.rewriteTo}${request.nextUrl.search}`, request.url))
    : NextResponse.next()
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}

export default function proxy(request: NextRequest) {
  const internal = matchInternal(request.nextUrl.pathname)
  if (internal) return handleInternal(request, internal)
  // Visitors from Spanish-speaking countries default to Spanish even with an
  // English browser: treat their Accept-Language as "es". The NEXT_LOCALE
  // cookie (an explicit language choice) is still checked first by next-intl,
  // and prefixed URLs such as /en/... are never redirected.
  if (prefersSpanishByCountry(request.headers)) {
    const headers = new Headers(request.headers)
    headers.set("accept-language", "es")
    return handleI18n(new NextRequest(request.url, { headers, method: request.method }))
  }
  return handleI18n(request)
}

export const config = {
  // First entry: skip API, Next internals and any path with a file extension
  // (kept verbatim). Then every internal URL in any capitalization (Vercel
  // matches routes case-insensitively), including RSC/segment variants
  // (/mikrotik.rsc…) and the locale-prefixed route.
  matcher: [
    "/((?!api|_next|_vercel|.*\..*).*)",
    "/:page([Mm][Ii][Kk][Rr][Oo][Tt][Ii][Kk])(.*)",
    "/:locale/:page([Mm][Ii][Kk][Rr][Oo][Tt][Ii][Kk])(.*)",
    "/:page([Cc][Aa][Ll][Cc][Uu][Ll][Aa][Dd][Oo][Rr][Aa])(.*)",
    "/:locale/:page([Cc][Aa][Ll][Cc][Uu][Ll][Aa][Dd][Oo][Rr][Aa])(.*)",
    "/:page([Oo][Ll][Tt])(.*)",
    "/:locale/:page([Oo][Ll][Tt])(.*)",
  ],
}
