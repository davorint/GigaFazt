import { NextResponse } from "next/server"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { clientForToken } from "@/lib/wispdavor/portal-server"
import { requestPlanChange } from "@/lib/wispdavor/portal-requests"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

/** POST /api/mi-cuenta/plan {token, plan}: the client asks for another plan from their portal (a request in Reportes; the team applies it the next month). */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 256) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
  let token = ""
  let plan = ""
  try {
    const b = JSON.parse(raw) as { token?: unknown; plan?: unknown }
    token = typeof b.token === "string" ? b.token.trim() : ""
    plan = typeof b.plan === "string" ? b.plan.trim().slice(0, 40) : ""
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: HEADERS })
  }
  try {
    const found = await clientForToken(token, ipHash(clientIp(request.headers)), false)
    if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (found.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (found.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    const r = await requestPlanChange(found.client, plan)
    if (r.kind === "bad-plan" || r.kind === "same-plan") return NextResponse.json({ error: r.kind }, { status: 400, headers: HEADERS })
    return NextResponse.json({ ok: true, ...r }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
