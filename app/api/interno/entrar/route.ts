import { NextResponse, type NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { AUTH_COOKIE, AUTH_DAYS, authConfigured, newSession, passwordOk, safeNext } from "@/lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH } from "@/lib/internal-pages"
import { clientIp, hit, ipHash, underLimit } from "@/lib/reports/limits"

/** Failed sign-ins allowed per sender address, and from everyone together, per hour. */
const LOGIN_FAILS_PER_IP = 10
const LOGIN_FAILS_GLOBAL = 200

/**
 * Sign-in for /interno (form POST from /interno/entrar): a right password sets a signed session cookie (HttpOnly,
 * AUTH_DAYS) and goes back to the page asked for; a wrong one goes back to the form with an error after a short wait.
 * Failed attempts are counted in report_hits ("li:<address hash>" and "li:all"); over either limit the password isn't
 * even checked. Without the database only the wait applies. Without the host values (lib/internal-auth.ts) nobody
 * can sign in and the form says so.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const password = String(form?.get("password") ?? "").slice(0, 200)
  const next = safeNext(form?.get("next"))
  const pool = hasDatabase() ? getPool() : null
  const mine = `li:${ipHash(clientIp(request.headers))}`

  let error: "1" | "limit" | "config" | null = null
  if (!authConfigured()) error = "config"
  else if (pool && !((await underLimit(pool, mine, LOGIN_FAILS_PER_IP).catch(() => true)) && (await underLimit(pool, "li:all", LOGIN_FAILS_GLOBAL).catch(() => true)))) error = "limit"
  else if (!password || !(await passwordOk(password))) {
    error = "1"
    if (pool) await Promise.all([hit(pool, mine), hit(pool, "li:all")]).catch(() => undefined)
  }

  let res: NextResponse
  if (!error) {
    res = NextResponse.redirect(new URL(next, request.url), 303)
    res.cookies.set(AUTH_COOKIE, await newSession(), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_DAYS * 24 * 60 * 60,
    })
  } else {
    if (error === "config") console.error("[interno] sign-in refused: INTERNO_PASS_HASH / INTERNO_SESSION_SECRET not set")
    await new Promise((r) => setTimeout(r, 800))
    const to = new URL(LOGIN_PATH, request.url)
    to.searchParams.set("error", error)
    if (next !== "/interno") to.searchParams.set("next", next)
    res = NextResponse.redirect(to, 303)
  }
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}
