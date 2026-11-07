import { NextResponse } from "next/server"
import { z } from "zod"

const leadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().min(5).optional(),
  address: z.string().optional(),
  planId: z.string().optional(),
  addOnIds: z.array(z.string()).optional(),
  preferredDate: z.string().optional(),
  consent: z.literal(true),
  // Honeypot: must stay empty.
  company: z.string().max(0).optional(),
})

/**
 * Lead intake. Validates with zod, then forwards to a CRM webhook if configured
 * (BUSINESS.md → CRM / lead webhook), otherwise logs to the server console.
 */
export async function POST(request: Request) {
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const webhook = process.env.CRM_WEBHOOK_URL
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => {})
  } else {
    // No CRM configured yet; log for visibility until a webhook is set.
    console.log("[lead]", parsed.data)
  }

  return NextResponse.json({ ok: true })
}
