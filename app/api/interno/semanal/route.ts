import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { runWeekly } from "@/lib/interno/weekly-server"
import { json, requireInterno } from "@/lib/internal-api"
import { todayInMexico } from "@/lib/lead"

/** POST /api/interno/semanal: sends the weekly summary now (Números' button; it also goes by itself on Mondays). */
export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    return json({ ok: true, ...(await runWeekly(todayInMexico(), true)) })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
