import { NextResponse } from "next/server"
import { lookupBalance } from "@/lib/customer/server"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { phoneKey } from "@/lib/reports/model"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * POST /api/clientes/saldo {phone, pppoe}: a client's balance when the phone and the PPPoE user belong to the same
 * client (/clientes → Mi saldo; lib/customer/server.ts). 20 per hour per sender, 5 failures per hour per phone; a
 * wrong pair answers the same as an unknown phone.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 1024) return NextResponse.json({ error: "too_large" }, { status: 413, headers: NO_STORE })
  let body: { phone?: unknown; pppoe?: unknown }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE })
  }
  const phone = typeof body.phone === "string" ? body.phone.slice(0, 30) : ""
  const pppoe = typeof body.pppoe === "string" ? body.pppoe.trim().slice(0, 64) : ""
  const fields = [phoneKey(phone).length !== 10 && "phone", !pppoe && "pppoe"].filter(Boolean)
  if (fields.length) return NextResponse.json({ error: "invalid_input", fields }, { status: 422, headers: NO_STORE })
  try {
    const r = await lookupBalance(phone, pppoe, ipHash(clientIp(request.headers)))
    if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
    if (r.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: NO_STORE })
    if (r.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ ok: true, balance: r.balance }, { headers: NO_STORE })
  } catch {
    console.error("[clientes] balance lookup failed")
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
  }
}
