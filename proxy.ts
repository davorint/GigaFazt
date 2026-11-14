import { NextRequest, NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { prefersSpanishByCountry } from "./lib/geo-locale"
import { INTERNAL_HEADERS, internalCredentials, isAuthorized, matchInternal, type InternalMatch } from "./lib/internal-auth"

// next-intl locale negotiation. In Next 16 the `middleware` convention was
// renamed to `proxy`; this is the same request-time handler.
const handleI18n = createMiddleware(routing)

/**
 * Internal pages (/mikrotik): Basic Auth, noindex, no shared caching.
 * /mikrotik is rewritten to the Spanish route it is served from. Without
 * credentials in env every internal URL answers like an unknown page (404).
 */
function handleInternal(request: NextRequest, match: InternalMatch): NextResponse {
  const expected = internalCredentials()
  if (!expected) return NextResponse.rewrite(new URL("/es/404", request.url))
  if (!isAuthorized(request.headers.get("authorization"), expected)) {
    return new NextResponse("Autenticación requerida.", {
      status: 401,
      headers: {
        ...INTERNAL_HEADERS,
        "WWW-Authenticate": 'Basic realm="GigaFazt interno", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }
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
  // (kept verbatim). Then every internal URL, including RSC/segment variants
  // (/mikrotik.rsc…) and the locale-prefixed route, so all are behind the password.
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)", "/mikrotik(.*)", "/:locale/mikrotik(.*)"],
}
