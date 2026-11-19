import type { NextRequest } from "next/server"
import { json, whoIs } from "@/lib/internal-api"
import { accountsOn } from "@/lib/team/server"

/** GET: who this session is ({ name, admin } for a team account), and whether team accounts are set up. */
export async function GET(request: NextRequest) {
  const w = await whoIs(request)
  if (!w) return json({ error: "signin" }, 401)
  const accounts = await accountsOn().catch(() => false)
  return json({ member: w.member ? { id: w.member.id, name: w.member.name, admin: w.member.admin } : null, accounts })
}
