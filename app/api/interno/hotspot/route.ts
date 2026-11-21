import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { decodePlans } from "@/lib/wispdavor/hotspot"
import { createVouchers, getPlans, listVouchers, markSold, savePlans } from "@/lib/wispdavor/hotspot-server"
import { listRouters } from "@/lib/wispdavor/routers-server"

/**
 * Hotspot vouchers for staff (WispDavor → Hotspot). GET: the plans and the last 500 vouchers. PUT {plans}: saves the
 * plans. POST {action: "generate", routerId, planId, count} | {action: "sold", code, sold}. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    const routers = (await listRouters()).filter((r) => r.hotspot).map((r) => ({ id: r.id, name: r.name, siteId: r.siteId }))
    return json({ ok: true, plans: await getPlans(), vouchers: await listVouchers(), routers })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as { plans?: unknown }
  try {
    await savePlans(decodePlans(b.plans), await editorOf(request))
    return json({ ok: true, plans: await getPlans() })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const b = (await request.json().catch(() => ({}))) as { action?: unknown; routerId?: unknown; planId?: unknown; count?: unknown; code?: unknown; sold?: unknown }
  try {
    if (b.action === "generate") {
      const r = await createVouchers(String(b.routerId ?? ""), String(b.planId ?? ""), Number(b.count) || 1, await editorOf(request))
      return "error" in r ? json({ error: r.error }, 409) : json({ ok: true, codes: r.codes })
    }
    if (b.action === "sold" && typeof b.code === "string" && /^[a-z0-9]{8}$/.test(b.code)) {
      await markSold(b.code, b.sold === true)
      return json({ ok: true })
    }
    return json({ error: "bad-action" }, 400)
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
