import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { digestText } from "@/lib/interno/digest"
import { decodePayable, type Payable } from "@/lib/finance/payables"
import { decodeSite, type Site } from "@/lib/sites/model"
import { decodeReceivable, type Receivable } from "@/lib/finance/receivables"
import { todaySummary } from "@/lib/interno/today"
import { decodeClient, type Client } from "@/lib/clients/model"
import { decodeItem, type Item } from "@/lib/materials/catalog"
import { decodeNote, type Note } from "@/lib/notes/model"
import { decodePayment, type Payment } from "@/lib/payments/model"
import { decodeReport, type Report } from "@/lib/reports/model"
import { alertChannels, sendText } from "@/lib/reports/notify"
import { decodeMove, decodeUnit, type Move, type Unit } from "@/lib/stock/model"
import { decodeTool, type Tool } from "@/lib/tools/model"
import { getPool } from "@/lib/db/client"
import { decodeContract, type Contract } from "@/lib/contracts/model"
import { decodeProvider, type Provider } from "@/lib/providers/model"
import { SITE_URL } from "@/lib/site"

/**
 * The daily summary to the team's chat (lib/interno/digest.ts), through the same Telegram / webhook as the web reports.
 * GET: the daily run (vercel.json cron), allowed with `Authorization: Bearer <CRON_SECRET>` (set on the host).
 * POST: "Enviar resumen ahora" from /interno (signed in). Nothing is sent when everything is in order.
 */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date())

async function rows<T>(table: string, decode: (v: unknown) => T | null): Promise<T[]> {
  const r = (await getPool().query(`select data from "${table}" where deleted_at is null`)).rows as { data: unknown }[]
  return r.map((x) => decode(x.data)).filter((x): x is T => x !== null)
}

async function run() {
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const ch = alertChannels()
  if (!ch.telegram && !ch.webhook) return json({ ok: false, error: "not-configured" }, 409)
  const day = today()
  const s = todaySummary(
    {
      reports: await rows<Report>("reports", decodeReport),
      clients: await rows<Client>("clients", decodeClient),
      payments: await rows<Payment>("payments", decodePayment),
      tools: await rows<Tool>("tools", decodeTool),
      items: await rows<Item>("materials", decodeItem),
      moves: await rows<Move>("stock_moves", decodeMove),
      units: await rows<Unit>("units", decodeUnit),
      notes: await rows<Note>("notes", decodeNote),
      payables: await rows<Payable>("payables", decodePayable),
      receivables: await rows<Receivable>("receivables", decodeReceivable),
      sites: await rows<Site>("sites", decodeSite),
      contracts: await rows<Contract>("contracts", decodeContract),
      providers: await rows<Provider>("providers", decodeProvider),
    },
    day
  )
  const text = digestText(s, day, `${SITE_URL}/interno`)
  if (!text) return json({ ok: true, sent: false, reason: "all-clear" })
  const sent = await sendText("resumen", text, s)
  return json({ ok: sent.telegram !== false && sent.webhook !== false, sent: true, ...sent })
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401)
  try {
    return await run()
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  try {
    return await run()
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
