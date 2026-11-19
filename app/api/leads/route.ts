import { NextResponse } from "next/server"
import { leadSchema } from "@/lib/lead"
import { saveLead } from "@/lib/leads/server"
import { hasDatabase } from "@/lib/db/client"

const MAX_BODY_BYTES = 8 * 1024

/**
 * Lead intake. Validates with the shared zod schema (lib/lead.ts), saves it
 * to the database (listed in /interno/admin/clientes) and forwards it to a CRM
 * webhook if configured (BUSINESS.md → CRM / lead webhook), both before
 * answering: the visitor gets an error when neither kept it, so the request is
 * never lost silently. With neither configured it is only logged.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 })
  }

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  // Honeypot filled → pretend success so bots don't learn, but drop the lead.
  if (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { website?: unknown }).website === "string" &&
    (input as { website: string }).website.length > 0
  ) {
    return NextResponse.json({ ok: true })
  }

  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        fields: parsed.error.issues.map((i) => i.path.join(".")),
      },
      { status: 422 }
    )
  }

  const { website: _honeypot, ...lead } = parsed.data
  void _honeypot
  const payload = { ...lead, receivedAt: new Date().toISOString() }
  let locale = "es"
  try {
    if (/^\/en(\/|$)/.test(new URL(request.headers.get("referer") ?? "").pathname)) locale = "en"
  } catch {
    // No referer: Spanish, the default.
  }

  const saved = await saveLead(lead, locale)
  const webhook = process.env.CRM_WEBHOOK_URL
  let forwarded = false
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    forwarded = !!res?.ok
    if (!forwarded && saved) console.error("[lead] CRM webhook failed; kept in the database")
  }
  if (!saved && !forwarded) {
    // Neither a CRM nor the database: the log is the only place the request is seen. With the database, personal
    // data stays out of the server logs.
    if (!webhook && !hasDatabase()) console.log("[lead]", payload)
    else return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
