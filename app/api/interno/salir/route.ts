import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE } from "@/lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH } from "@/lib/internal-pages"

/** Sign-out for /interno (form POST): removes the session cookie and goes to the sign-in page. */
export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303)
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}
