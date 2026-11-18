import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE } from "@/lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH } from "@/lib/internal-pages"

/**
 * Sign-out for /interno (form POST): removes the session cookie and goes to the sign-in page.
 * ?borrar=1 ("Salir y borrar los datos de este teléfono"): also tells the browser to clear everything this site stored
 * (Clear-Site-Data), since the page's own clearing can race with a sync that writes its state back.
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303)
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  if (request.nextUrl.searchParams.get("borrar")) res.headers.set("Clear-Site-Data", '"storage", "cache"')
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}
