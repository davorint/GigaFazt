/**
 * The database client for server code only (route handlers): node-postgres with a small pool, handed to Vercel with
 * `attachDatabasePool` so Fluid compute closes idle connections before a function instance is suspended (the
 * neon-postgres skill's recommendation for Vercel; sync needs real transactions). The pooled DATABASE_URL (PgBouncer)
 * is used for app traffic; the database is set to "gigafazt" (lib/db/url.ts).
 */
import "server-only"
import { attachDatabasePool } from "@vercel/functions"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { appDatabaseUrl } from "./url"

let pool: Pool | null = null
let db: NodePgDatabase<typeof schema> | null = null

/** True when this deployment has a database to talk to. */
export const hasDatabase = () => Boolean(process.env.DATABASE_URL)

export function getPool(): Pool {
  if (pool) return pool
  const url = appDatabaseUrl(process.env.DATABASE_URL)
  if (!url) throw new Error("DATABASE_URL is not set: pull it from Vercel into .env.local")
  pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 })
  attachDatabasePool(pool)
  return pool
}

/** The database, created on first use; throws a clear error when DATABASE_URL is missing. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (db) return db
  db = drizzle(getPool(), { schema })
  return db
}
