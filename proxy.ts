import { NextRequest } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { prefersSpanishByCountry } from "./lib/geo-locale"

// next-intl locale negotiation. In Next 16 the `middleware` convention was
// renamed to `proxy`; this is the same request-time handler.
const handleI18n = createMiddleware(routing)

export default function proxy(request: NextRequest) {
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
  // Skip API, Next internals and any path with a file extension.
  matcher: "/((?!api|_next|_vercel|.*\..*).*)",
}
