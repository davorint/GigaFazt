import { NextResponse } from "next/server"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { clientForToken } from "@/lib/wispdavor/portal-server"
import { stopAutopay } from "@/lib/wispdavor/stripe-server"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

/** POST /api/mi-cuenta/domiciliacion {token}: the client stops card auto-pay from their portal (the card is removed). */
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
    const found = await clientForToken(token, ipHash(clientIp(request.headers)), false)
    if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (found.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (found.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    await stopAutopay(found.client.id)
    return NextResponse.json({ ok: true }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
