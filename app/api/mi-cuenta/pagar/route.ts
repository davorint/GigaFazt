import { NextResponse } from "next/server"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { PAY_KINDS } from "@/lib/wispdavor/online"
import { clientForToken } from "@/lib/wispdavor/portal-server"
import { SITE_URL, SITE_URL_CONFIGURED } from "@/lib/site"
import { startCheckout, stripeConfigured } from "@/lib/wispdavor/stripe-server"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

/**
 * POST /api/mi-cuenta/pagar {token, kind: card|oxxo|spei, saveCard}: a Stripe Checkout for what the client owes (or a
 * month ahead) and its address; back to /mi-cuenta when done. The amount is computed here, never taken from the page.
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  const raw = await request.text()
  if (raw.length > 512) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
  let b: { token?: unknown; kind?: unknown; saveCard?: unknown } = {}
  try {
    b = JSON.parse(raw) as typeof b
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: HEADERS })
  }
  const token = typeof b.token === "string" ? b.token.trim() : ""
  const kind = PAY_KINDS.find((k) => k === b.kind)
  if (!kind) return NextResponse.json({ error: "invalid_input" }, { status: 422, headers: HEADERS })
  try {
    const found = await clientForToken(token, ipHash(clientIp(request.headers)), false)
    if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (found.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (found.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    // Back to the site's own address (the request's only when the site address isn't set, e.g. local).
    const origin = SITE_URL_CONFIGURED ? SITE_URL : new URL(request.url).origin
    const r = await startCheckout(found.client, kind, b.saveCard === true, `${origin}/mi-cuenta#${token}`)
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409, headers: HEADERS })
    return NextResponse.json({ ok: true, url: r.url }, { headers: HEADERS })
  } catch (e) {
    console.error("[mi-cuenta] checkout failed", e instanceof Error ? e.message.slice(0, 200) : "")
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
