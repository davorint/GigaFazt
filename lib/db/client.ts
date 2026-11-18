/**
 * The database client for server code only (route handlers): Neon's HTTP driver, one request per query, which suits
 * Vercel functions (no connection to keep open). DATABASE_URL comes from Vercel (the Neon integration) or .env.local.
 */
import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import * as schema from "./schema"
import { appDatabaseUrl } from "./url"

let db: NeonHttpDatabase<typeof schema> | null = null

/** True when this deployment has a database to talk to. */
export const hasDatabase = () => Boolean(process.env.DATABASE_URL)

/** The database, created on first use; throws a clear error when DATABASE_URL is missing. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (db) return db
  const url = appDatabaseUrl(process.env.DATABASE_URL)
  if (!url) throw new Error("DATABASE_URL is not set: pull it from Vercel into .env.local")
  db = drizzle(neon(url), { schema })
  return db
}
