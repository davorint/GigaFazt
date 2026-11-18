/**
 * The app's database is "gigafazt" (owner, 2026-11-17), inside the Neon project GIGAFAZT. Vercel's Neon integration
 * manages DATABASE_URL and points it at the project's default "neondb" (leftover tables from an old test live there),
 * so the database name is set here instead of editing variables the integration owns. Host, user and password stay
 * as Vercel gives them.
 */
export const DB_NAME = "gigafazt"

/** The connection string with the database set to DB_NAME; "" when there is none. */
export function appDatabaseUrl(raw: string | undefined): string {
  if (!raw) return ""
  try {
    const u = new URL(raw)
    u.pathname = `/${DB_NAME}`
    return u.toString()
  } catch {
    return ""
  }
}
