import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { cronAuthorized, json } from "@/lib/internal-api"
import { neonSnapshot, telegramFile } from "@/lib/backup/auto"

/**
 * The weekly backup (vercel.json cron, Mondays 09:00 UTC = 03:00 in Mexico City), allowed with
 * `Authorization: Bearer <CRON_SECRET>`. Neon snapshot and Telegram file run independently (lib/backup/auto.ts).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401)
  const day = new Date().toISOString().slice(0, 10)
  const run = async (f: () => Promise<{ ok: boolean; detail: string }>) => f().catch((e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }))
  const neon = await run(() => neonSnapshot(day))
  const telegram = hasDatabase() ? await run(() => telegramFile(day)) : { ok: false, detail: "sin base de datos" }
  if (!neon.ok || !telegram.ok) console.error(`[respaldo] neon: ${neon.detail} · telegram: ${telegram.detail}`)
  return json({ ok: neon.ok || telegram.ok, neon, telegram })
}
