/**
 * Flood control for the public report form (/reportar → POST /api/reportes).
 *
 * Limits are generous on purpose: our clients reach the internet through the carriers' NAT, so a whole building
 * shares a few public addresses, and during an outage they write from their phones' mobile data, which carriers also
 * share between many people. A real outage must never be refused, so:
 * - per sender address: PER_IP accepted reports per hour (a salted hash of the address is kept a day, never the
 *   address itself);
 * - everyone together: GLOBAL accepted reports per hour (above that it's an attack, not clients);
 * - the same phone number with an open report from the form in the last DUP_HOURS gets that report's code back and
 *   nothing new is created (people press send twice, or report again while waiting).
 * Refused senders get 429 and the form offers WhatsApp.
 */
import "server-only"
import { createHash } from "node:crypto"
import type { Pool } from "pg"

export const PER_IP = 8
export const GLOBAL = 150
export const DUP_HOURS = 12

/** The sender's address as the host reports it (Vercel: x-forwarded-for, first entry; x-real-ip). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return fwd || headers.get("x-real-ip")?.trim() || ""
}

/** The salt for stored hashes of addresses and phones: REPORT_HASH_SALT, else the /interno session secret (both set on the host). */
export function hashSalt(): string {
  return process.env.REPORT_HASH_SALT || process.env.INTERNO_SESSION_SECRET || "gigafazt-reportes"
}

/** Salted, so the stored value can't be turned back into an address by trying them all. Changes every day. */
export function ipHash(ip: string, day = new Date().toISOString().slice(0, 10)): string {
  return createHash("sha256").update(`${hashSalt()}|${day}|${ip}`).digest("hex").slice(0, 32)
}

/** Whether one more report from this address fits; old rows are cleared on the way. */
export async function withinLimits(pool: Pool, hash: string): Promise<boolean> {
  await pool.query(`delete from report_hits where at < now() - interval '1 day'`)
  const r = (
    await pool.query(
      `select count(*) filter (where ip_hash = $1)::int as mine, count(*) filter (where ip_hash !~ ':')::int as everyone from report_hits where at > now() - interval '1 hour'`,
      [hash]
    )
  ).rows[0] as { mine: number; everyone: number }
  return r.mine < PER_IP && r.everyone < GLOBAL
}

/**
 * Other public lookups on /clientes (report status, balance) share the table with a prefix ("q:", "b:", "bp:"), so
 * they never count against the report limits above. True when fewer than `max` hits of `key` in the last hour.
 */
export async function underLimit(pool: Pool, key: string, max: number): Promise<boolean> {
  const n = ((await pool.query(`select count(*)::int as n from report_hits where ip_hash = $1 and at > now() - interval '1 hour'`, [key])).rows[0] as { n: number }).n
  return n < max
}

export async function hit(pool: Pool, key: string) {
  await pool.query(`insert into report_hits (ip_hash) values ($1)`, [key])
}
