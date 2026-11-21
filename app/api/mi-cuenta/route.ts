import { NextResponse } from "next/server"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { methodsFor } from "@/lib/wispdavor/online"
import { portalView } from "@/lib/wispdavor/portal-server"
import { autopayOf, stripeConfigured } from "@/lib/wispdavor/stripe-server"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

/**
 * POST /api/mi-cuenta {token}: a client's portal (/mi-cuenta#<token>; lib/wispdavor/portal-server.ts). The token goes in
 * the body, never in the address. 60 reads per hour per sender; a wrong or revoked token answers like an unknown one.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 256) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
  let token = ""
  try {
    const b = JSON.parse(raw) as { token?: unknown }
    token = typeof b.token === "string" ? b.token.trim() : ""
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: HEADERS })
  }
  try {
    // Online payment only when Stripe is set up on the host (phase 2).
    const online = stripeConfigured() ? async (c: { id: string }, amount: number) => ({ amount, methods: methodsFor(amount), autopay: await autopayOf(c.id) }) : undefined
    const r = await portalView(token, ipHash(clientIp(request.headers)), online)
    if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (r.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (r.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    return NextResponse.json({ ok: true, view: r.view }, { headers: HEADERS })
  } catch {
    console.error("[mi-cuenta] portal lookup failed")
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
