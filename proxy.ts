import { NextRequest, NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { prefersSpanishByCountry } from "./lib/geo-locale"
import { AUTH_COOKIE, cookieOk } from "./lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH, matchInternal, type InternalMatch } from "./lib/internal-pages"

// next-intl locale negotiation. In Next 16 the `middleware` convention was
// renamed to `proxy`; this is the same request-time handler.
const handleI18n = createMiddleware(routing)

/**
 * Internal pages under /interno: noindex, behind the password (session cookie checked here, before any page or RSC
 * payload is served); without it every page except the sign-in one goes to /interno/entrar. Any capitalization is
 * rewritten to the Spanish route it is served from.
 */
async function handleInternal(request: NextRequest, match: InternalMatch): Promise<NextResponse> {
  let res: NextResponse
  if (!match.open && !(await cookieOk(request.cookies.get(AUTH_COOKIE)?.value))) {
    const to = new URL(LOGIN_PATH, request.url)
    const page = /^\/(?:[a-z]{2}\/)?(interno(?:\/[a-z0-9-]+)?)/i.exec(request.nextUrl.pathname)
    if (page) to.searchParams.set("next", `/${page[1].toLowerCase()}`)
    res = NextResponse.redirect(to, 307)
  } else {
    res = match.rewriteTo ? NextResponse.rewrite(new URL(`${match.rewriteTo}${request.nextUrl.search}`, request.url)) : NextResponse.next()
  }
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}

export default async function proxy(request: NextRequest) {
  // The /interno sign-in and sign-out routes live under /api; "/:locale/interno" below also matches /api/interno.
  if (/^\/api\//i.test(request.nextUrl.pathname)) return NextResponse.next()
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
  // (kept verbatim). Then every /interno URL in any capitalization (Vercel
  // matches routes case-insensitively), including RSC/segment variants
  // (/interno.rsc…) and the locale-prefixed route.
  matcher: [
    "/((?!api|_next|_vercel|.*\..*).*)",
    "/:page([Ii][Nn][Tt][Ee][Rr][Nn][Oo])(.*)",
    "/:locale/:page([Ii][Nn][Tt][Ee][Rr][Nn][Oo])(.*)",
  ],
}
