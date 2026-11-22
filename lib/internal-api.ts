/**
 * The /api/interno/* routes check the same session cookie as the /interno pages (the proxy lets /api through, so each
 * route checks it itself), and here also who it is: a team account must still be active, and once accounts exist the
 * shared team password's sessions no longer reach the data, and a session signed in before the person's last password
 * change ends (lib/team). Pages ask the same when they open (SessionGuard). A refused session answers 401
 * { error: "signin" } so the phone sends the person to sign in again. Server code only.
 */
import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, sessionOf } from "./internal-auth"
import { INTERNAL_HEADERS } from "./internal-pages"
import { areaAllowed, type Access, type Area } from "./team/roles"
import { accountsOn, memberById, sessionCurrent, type Member } from "./team/server"

export type Who = { member: Member | null }

/** Who is signed in, or null when the session isn't valid (or no longer allowed). */
export async function whoIs(request: NextRequest): Promise<Who | null> {
  const s = await sessionOf(request.cookies.get(AUTH_COOKIE)?.value)
  if (!s) return null
  try {
    if (s.member) {
      const m = await memberById(s.member)
      return m && m.active && sessionCurrent(m, s.issuedAt) ? { member: m } : null
    }
    // The shared password: only while no team account has been set up.
    return (await accountsOn()) ? null : { member: null }
  } catch {
    // The database being down shouldn't lock everyone out of what doesn't need it; data routes fail on their own.
    return { member: null }
  }
}

/**
 * Changes to routers (owner, 2026-11-21: "admins only"): turning off read-only, write users, actions over REST/API,
 * the automatic switch, sending differences, creating PPPoE users. Allowed to an admin account, or to the shared
 * password while no team account exists (nobody can be told apart then).
 */
export async function canChangeRouters(request: NextRequest): Promise<boolean> {
  const w = await whoIs(request)
  return !!w && (!w.member || w.member.admin)
}

/** Phase 14: what this session reaches (admins and the shared password: everything). */
export async function accessOf(request: NextRequest): Promise<Access | null> {
  const w = await whoIs(request)
  if (!w) return null
  return w.member ? { admin: w.member.admin, role: w.member.role } : { admin: true, role: "oficina" }
}

/** null when the session's role reaches `area`; otherwise the 401 / 403 to return. */
export async function requireArea(request: NextRequest, area: Area): Promise<NextResponse | null> {
  const a = await accessOf(request)
  if (!a) return NextResponse.json({ error: "signin" }, { status: 401, headers: INTERNAL_HEADERS })
  return areaAllowed(a, area) ? null : NextResponse.json({ error: "forbidden" }, { status: 403, headers: INTERNAL_HEADERS })
}

/** null when the request is signed in; otherwise the 401 to return. */
export async function requireInterno(request: NextRequest): Promise<NextResponse | null> {
  return (await whoIs(request)) ? null : json({ error: "signin" }, 401)
}

/** The editor's name: the team account's, else the name the phone gave (`x-interno-nombre`), at most 40 characters. */
export async function editorOf(request: NextRequest): Promise<string> {
  const w = await whoIs(request)
  if (w?.member) return w.member.name
  const raw = request.headers.get("x-interno-nombre") ?? ""
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    // Not encoded: keep it as sent.
  }
  return name.replace(/\p{Cc}/gu, "").trim().slice(0, 40)
}

/** JSON with the internal headers (noindex, no cache, no referrer). */
export function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  for (const [k, v] of Object.entries(INTERNAL_HEADERS)) res.headers.set(k, v)
  return res
}

/**
 * A scheduled job's call (vercel.json crons): `Authorization: Bearer <CRON_SECRET>`, compared in constant time (hashes of
 * equal length); never allowed when CRON_SECRET isn't set.
 */
export function cronAuthorized(request: NextRequest): boolean {
  return bearerAuthorized(request, process.env.CRON_SECRET)
}

/** `Authorization: Bearer <secret>`, compared in constant time; never allowed without a secret. */
export function bearerAuthorized(request: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false
  const h = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(h(request.headers.get("authorization") ?? ""), h(`Bearer ${secret}`))
}
