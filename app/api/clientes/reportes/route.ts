import { NextResponse } from "next/server"
import { lookupReports, parseQuery } from "@/lib/customer/server"
import { clientIp, ipHash } from "@/lib/reports/limits"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * POST /api/clientes/reportes {q}: a client's reports by phone or report code (/clientes → Mis reportes). Only code,
 * problem, dates and status (lib/customer/server.ts). 30 lookups per hour per sender.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 1024) return NextResponse.json({ error: "too_large" }, { status: 413, headers: NO_STORE })
  let q: unknown
  try {
    q = (JSON.parse(raw) as { q?: unknown }).q
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE })
  }
  const parsed = typeof q === "string" ? parseQuery(q.slice(0, 40)) : null
  if (!parsed) return NextResponse.json({ error: "invalid_input" }, { status: 422, headers: NO_STORE })
  try {
    const r = await lookupReports(parsed, ipHash(clientIp(request.headers)))
    if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
    if (r.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: NO_STORE })
    return NextResponse.json({ ok: true, reports: r.reports }, { headers: NO_STORE })
  } catch {
    console.error("[clientes] report lookup failed")
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
  }
}
