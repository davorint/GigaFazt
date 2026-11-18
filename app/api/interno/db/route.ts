import type { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { getDb, hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"

/**
 * GET /api/interno/db: is the database reachable and are the tables there? Signed in only. Answers the Postgres
 * version, the last applied migration and how many rows each table has (never their content).
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ ok: false, error: "no-database-url" }, 503)
  try {
    const db = getDb()
    const info = (await db.execute(sql`select current_setting('server_version') as v, current_database() as d`)).rows[0]
    const version = info?.v
    const database = info?.d
    const tables = ["surveys", "materials", "providers", "clients", "sites", "tools", "stock_moves", "units", "reports", "payments", "deployments", "leads"]
    const counts: Record<string, number | null> = {}
    for (const t of tables) {
      try {
        const r = await db.execute(sql.raw(`select count(*)::int as n from "${t}"`))
        counts[t] = Number(r.rows[0]?.n ?? 0)
      } catch {
        counts[t] = null
      }
    }
    let migration: string | null = null
    try {
      const r = await db.execute(sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`)
      migration = r.rows[0] ? String(r.rows[0].created_at) : null
    } catch {
      migration = null
    }
    return json({ ok: true, postgres: version, database, migration, counts })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, 500)
  }
}
