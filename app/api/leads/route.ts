import { NextResponse } from "next/server"
import { leadSchema } from "@/lib/lead"

const MAX_BODY_BYTES = 8 * 1024

/**
 * Lead intake. Validates with the shared zod schema (lib/lead.ts), then
 * forwards to a CRM webhook if configured (BUSINESS.md → CRM / lead webhook),
 * otherwise logs to the server console.
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

  const webhook = process.env.CRM_WEBHOOK_URL
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (!res?.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 })
    }
  } else {
    // No CRM configured yet; log for visibility until a webhook is set.
    console.log("[lead]", payload)
  }

  return NextResponse.json({ ok: true })
}
