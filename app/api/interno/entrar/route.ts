import { NextResponse, type NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { AUTH_COOKIE, authConfigured, newSession, passwordOk, safeNext, sessionCookie } from "@/lib/internal-auth"
import { INTERNAL_HEADERS, LOGIN_PATH } from "@/lib/internal-pages"
import { clientIp, hit, ipHash, underLimit } from "@/lib/reports/limits"
import { accountsOn, signIn } from "@/lib/team/server"

/** Failed sign-ins allowed per sender address, and from everyone together, per hour. */
const LOGIN_FAILS_PER_IP = 10
const LOGIN_FAILS_GLOBAL = 200

/**
 * Sign-in for /interno (form POST from /interno/entrar). With a name: that team account's password (lib/team); the
 * session carries who it is. Without a name: the shared team password, only while no team account has been set up
 * (afterwards the form says to use your name). A right password sets a signed session cookie (HttpOnly, AUTH_DAYS)
 * and goes back to the page asked for; a wrong one goes back to the form with an error after a short wait. Failed
 * attempts are counted in report_hits ("li:<address hash>" and "li:all"); over either limit the password isn't even
 * checked. Without the database only the wait applies (and only the shared password works).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const password = String(form?.get("password") ?? "").slice(0, 200)
  const name = String(form?.get("name") ?? "").trim().slice(0, 40)
  const next = safeNext(form?.get("next"))
  const pool = hasDatabase() ? getPool() : null
  const mine = `li:${ipHash(clientIp(request.headers))}`

  let error: "1" | "limit" | "config" | "accounts" | null = null
  let memberId = ""
  if (!authConfigured()) error = "config"
  else if (pool && !((await underLimit(pool, mine, LOGIN_FAILS_PER_IP).catch(() => true)) && (await underLimit(pool, "li:all", LOGIN_FAILS_GLOBAL).catch(() => true)))) error = "limit"
  else if (name) {
    const m = await signIn(name, password).catch(() => null)
    if (m) memberId = m.id
    else error = "1"
  } else if (await accountsOn().catch(() => false)) error = "accounts"
  else if (!password || !(await passwordOk(password))) error = "1"
  if (error === "1" && pool) await Promise.all([hit(pool, mine), hit(pool, "li:all")]).catch(() => undefined)

  let res: NextResponse
  if (!error) {
    res = NextResponse.redirect(new URL(next, request.url), 303)
    res.cookies.set(AUTH_COOKIE, await newSession(Date.now(), memberId), sessionCookie(request.nextUrl.protocol === "https:"))
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
