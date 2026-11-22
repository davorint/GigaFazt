import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { dayProfile, hourly } from "@/lib/wispdavor/capacity"
import { capacityAll } from "@/lib/wispdavor/capacity-server"

/** GET /api/interno/capacidad: each deployment's links against its busy hour (phase 13), with its hour-of-day profile. */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    const sites = (await capacityAll()).map(({ buckets, ...x }) => ({ ...x, profile: dayProfile(hourly(buckets)) }))
    return json({ ok: true, sites })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
