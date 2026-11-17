/**
 * The /api/interno/* routes check the same session cookie as the /interno pages (the proxy lets /api through, so each
 * route checks it itself) and read who is making the change from the `x-interno-nombre` header (the name the phone
 * gave). Server code only.
 */
import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, cookieOk } from "./internal-auth"
import { INTERNAL_HEADERS } from "./internal-pages"

/** null when the request is signed in; otherwise the 401 to return. */
export async function requireInterno(request: NextRequest): Promise<NextResponse | null> {
  if (await cookieOk(request.cookies.get(AUTH_COOKIE)?.value)) return null
  return json({ error: "unauthorized" }, 401)
}

/** The editor's name from the phone (trimmed, at most 40 characters; "" when not given). */
export const editorOf = (request: NextRequest) => (request.headers.get("x-interno-nombre") ?? "").trim().slice(0, 40)

/** JSON with the internal headers (noindex, no cache, no referrer). */
export function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}
