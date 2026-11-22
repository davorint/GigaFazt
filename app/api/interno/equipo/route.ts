import type { NextRequest } from "next/server"
import { decodeRole } from "@/lib/team/roles"
import { AUTH_COOKIE, newSession, sessionCookie } from "@/lib/internal-auth"
import { hasDatabase } from "@/lib/db/client"
import { json, whoIs } from "@/lib/internal-api"
import { accountsOn, createMember, members, updateMember, type TeamError } from "@/lib/team/server"

/**
 * The team accounts (/interno/admin/usuarios, "Usuarios y accesos").
 * GET: the list (names, admin, active; never passwords).
 * POST { name, password, admin, role }: add someone (admins only; the very first account can be made by whoever is signed
 * in with the shared password, and it is always an admin).
 * PATCH { id, password?, active?, admin?, role? }: admins change anyone; everyone can change their own password.
 */
const fail = (e: TeamError) => json({ error: e }, e === "forbidden" ? 403 : e === "notFound" ? 404 : 422)

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "")
  if (text.length > 2000) return null
  try {
    const v = JSON.parse(text) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const w = await whoIs(request)
  if (!w) return json({ error: "signin" }, 401)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  return json({ members: await members(true), me: w.member?.id ?? null, admin: !!w.member?.admin, accounts: await accountsOn() })
}

export async function POST(request: NextRequest) {
  const w = await whoIs(request)
  if (!w) return json({ error: "signin" }, 401)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = await body(request)
  if (!b) return json({ error: "bad-json" }, 400)
  const first = !(await accountsOn())
  if (!first && !w.member?.admin) return fail("forbidden")
  const r = await createMember(String(b.name ?? ""), String(b.password ?? ""), first || b.admin === true, decodeRole(b.role))
  return typeof r === "string" ? fail(r) : json({ member: r })
}

export async function PATCH(request: NextRequest) {
  const w = await whoIs(request)
  if (!w) return json({ error: "signin" }, 401)
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = await body(request)
  if (!b || typeof b.id !== "string") return json({ error: "bad-json" }, 400)
  const self = w.member?.id === b.id
  const changesMore = b.active !== undefined || b.admin !== undefined || b.role !== undefined
  if (!w.member?.admin && (!self || changesMore)) return fail("forbidden")
  const r = await updateMember(b.id, {
    password: typeof b.password === "string" ? b.password : undefined,
    active: typeof b.active === "boolean" ? b.active : undefined,
    admin: typeof b.admin === "boolean" ? b.admin : undefined,
    role: b.role !== undefined ? decodeRole(b.role) : undefined,
  })
  if (typeof r === "string") return fail(r)
  const res = json({ member: r })
  // A new password ends the sessions signed in before it; the person who changed their own keeps this one.
  if (self && typeof b.password === "string") res.cookies.set(AUTH_COOKIE, await newSession(Date.now(), r.id), sessionCookie(request.nextUrl.protocol === "https:"))
  return res
}
