import type { NextRequest } from "next/server"
import { json, whoIs } from "@/lib/internal-api"
import { accountsOn } from "@/lib/team/server"

/** GET: who this session is ({ name, admin, role } for a team account), what it reaches, and whether accounts are set up. */
export async function GET(request: NextRequest) {
  const w = await whoIs(request)
  if (!w) return json({ error: "signin" }, 401)
  const accounts = await accountsOn().catch(() => false)
  // Phase 14: the role decides which pages open (lib/team/roles.ts); the shared password reaches everything.
  const access = w.member ? { admin: w.member.admin, role: w.member.role } : { admin: true, role: "oficina" as const }
  return json({ member: w.member ? { id: w.member.id, name: w.member.name, admin: w.member.admin, role: w.member.role } : null, accounts, access })
}
