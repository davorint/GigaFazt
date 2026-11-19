import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { LEAD_STATUSES } from "@/lib/db/schema"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { listLeads, updateLead, type LeadStatus } from "@/lib/leads/server"

/**
 * The website's requests (signed in only). GET: the newest 500. PATCH { id, status?, notes? }: changes one and returns
 * it (the editor's name from `x-interno-nombre`).
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ leads: await listLeads() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  let body: { id?: unknown; status?: unknown; notes?: unknown }
  try {
    body = JSON.parse((await request.text()).slice(0, 20_000))
  } catch {
    return json({ error: "bad-json" }, 400)
  }
  if (typeof body.id !== "string" || !UUID.test(body.id)) return json({ error: "bad-id" }, 400)
  const status = (LEAD_STATUSES as readonly unknown[]).includes(body.status) ? (body.status as LeadStatus) : undefined
  if (body.status !== undefined && !status) return json({ error: "bad-status" }, 400)
  if (body.notes !== undefined && typeof body.notes !== "string") return json({ error: "bad-notes" }, 400)
  try {
    const lead = await updateLead(body.id, { status, notes: body.notes as string | undefined }, await editorOf(request))
    return lead ? json({ lead }) : json({ error: "not-found" }, 404)
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
