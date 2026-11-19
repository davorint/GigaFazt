/**
 * The /api/interno/* routes check the same session cookie as the /interno pages (the proxy lets /api through, so each
 * route checks it itself), and here also who it is: a team account must still be active, and once accounts exist the
 * shared team password's sessions no longer reach the data (lib/team). A refused session answers 401
 * { error: "signin" } so the phone sends the person to sign in again. Server code only.
 */
import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, sessionOf } from "./internal-auth"
import { INTERNAL_HEADERS } from "./internal-pages"
import { accountsOn, memberById, type Member } from "./team/server"

export type Who = { member: Member | null }

/** Who is signed in, or null when the session isn't valid (or no longer allowed). */
export async function whoIs(request: NextRequest): Promise<Who | null> {
  const s = await sessionOf(request.cookies.get(AUTH_COOKIE)?.value)
  if (!s) return null
  try {
    if (s.member) {
      const m = await memberById(s.member)
      return m && m.active ? { member: m } : null
    }
    // The shared password: only while no team account has been set up.
    return (await accountsOn()) ? null : { member: null }
  } catch {
    // The database being down shouldn't lock everyone out of what doesn't need it; data routes fail on their own.
    return { member: null }
  }
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
