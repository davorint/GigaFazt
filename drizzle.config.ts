import { defineConfig } from "drizzle-kit"

/**
 * Migrations for the Neon database (lib/db/schema.ts → drizzle/*.sql, reviewed in git).
 *   npm run db:generate   write a migration from the schema changes
 *   npm run db:migrate    apply the pending ones to the database in DATABASE_URL (the dev branch locally)
 * The connection string comes from .env.local (gitignored), pulled from Vercel; it never goes in the repository.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
  strict: true,
  verbose: true,
})
