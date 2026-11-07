import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

// next-intl locale negotiation. In Next 16 the `middleware` convention was
// renamed to `proxy`; this is the same request-time handler.
export default createMiddleware(routing)

export const config = {
  // Skip API, Next internals and any path with a file extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
}
