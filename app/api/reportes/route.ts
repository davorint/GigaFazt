import { NextResponse } from "next/server"
import { reportSchema } from "@/lib/report-form"
import { insertWebReport } from "@/lib/reports/server"

const MAX_BODY_BYTES = 8 * 1024

/**
 * A client's problem report from the public form (/reportar). Validated with the shared schema (lib/report-form.ts),
 * saved to the database before answering (the answer carries the report's code), listed in
 * /interno/admin/reportes_clientes. Personal data never goes to the server log.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  // Honeypot filled → pretend success so bots don't learn, but drop it.
  if (typeof input === "object" && input !== null && typeof (input as { website?: unknown }).website === "string" && (input as { website: string }).website.length > 0) {
    return NextResponse.json({ ok: true, code: "R-000000" })
  }
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", fields: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 422 })
  const { website: _honeypot, consent: _consent, ...form } = parsed.data
  void _honeypot
  void _consent
  try {
    const saved = await insertWebReport(form)
    if (!saved) return NextResponse.json({ error: "unavailable" }, { status: 503 })
    return NextResponse.json({ ok: true, code: saved.code })
  } catch {
    console.error("[report] could not be saved")
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}
