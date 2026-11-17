import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, AUTH_DAYS, cookieFor, passwordOk, safeNext } from "@/lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH } from "@/lib/internal-pages"

/**
 * Sign-in for /interno (form POST from /interno/entrar): a right password sets the session cookie (HttpOnly, 30
 * days) and goes back to the page asked for; a wrong one goes back to the form with an error, after a short wait.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const password = String(form?.get("password") ?? "").slice(0, 200)
  const next = safeNext(form?.get("next"))
  let res: NextResponse
  if (password && (await passwordOk(password))) {
    res = NextResponse.redirect(new URL(next, request.url), 303)
    res.cookies.set(AUTH_COOKIE, await cookieFor(password), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_DAYS * 24 * 60 * 60,
    })
  } else {
    await new Promise((r) => setTimeout(r, 800))
    const to = new URL(LOGIN_PATH, request.url)
    to.searchParams.set("error", "1")
    if (next !== "/interno") to.searchParams.set("next", next)
    res = NextResponse.redirect(to, 303)
  }
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}
