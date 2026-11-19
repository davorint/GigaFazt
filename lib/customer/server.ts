/**
 * The client area at /clientes (owner, 2026-11-18): what a client can look up without an account.
 *
 * - Their reports: by the phone they gave (or the phone of the client in Clientes) or by a report code. Only the code,
 *   the problem, dates and the status go back: never names, addresses or notes. Last 90 days, 10 at most.
 * - Their balance: needs the phone AND the PPPoE user of the same client (owner: "Phone + PPPoE user"), so knowing
 *   someone's phone isn't enough. Answers the first name (to confirm it's them), the status and amounts from the
 *   same ledger as Cobranza.
 *
 * Limits (rows in report_hits with a prefix, never the address itself): 30 report lookups and 20 balance lookups per
 * hour per sender address, and 5 failed balance attempts per hour per phone, so nobody can try PPPoE users until one
 * matches.
 */
import "server-only"
import { createHash } from "node:crypto"
import { decodeClient } from "../clients/model"
import { getPool, hasDatabase } from "../db/client"
import { todayInMexico } from "../lead"
import { decodePayment, ledger, type PayStatus, type Payment } from "../payments/model"
import { hashSalt, hit, underLimit } from "../reports/limits"
import { phoneKey, reportCode, type ReportCategory, type ReportStatus } from "../reports/model"

export const LOOKUPS_PER_HOUR = 30
export const BALANCE_PER_HOUR = 20
export const FAILS_PER_PHONE = 5

export type PublicReport = { code: string; category: ReportCategory; status: ReportStatus; createdAt: string; visitDate: string; resolvedAt: string }
export type ReportLookup = { kind: "ok"; reports: PublicReport[] } | { kind: "limited" } | null

const CODE = /^R-?([A-Z0-9]{6})$/i

/** "R-1A2B3C", "r1a2b3c" or a phone (10 digits with or without +52). */
export function parseQuery(q: string): { code: string } | { phone: string } | null {
  const t = q.trim().replace(/\s+/g, "")
  const m = CODE.exec(t)
  if (m) return { code: m[1].toUpperCase() }
  const key = phoneKey(t)
  return key.length === 10 && /^(\+?52|04[45])?\d{10}$/.test(t.replace(/[-().]/g, "")) ? { phone: key } : null
}

export async function lookupReports(q: { code: string } | { phone: string }, sender: string): Promise<ReportLookup> {
  if (!hasDatabase()) return null
  const pool = getPool()
  if (!(await underLimit(pool, `q:${sender}`, LOOKUPS_PER_HOUR))) return { kind: "limited" }
  await hit(pool, `q:${sender}`)
  const digits = `right(regexp_replace(coalesce(%s, ''), '\\D', '', 'g'), 10)`
  const rows = (
    "code" in q
      ? await pool.query(
          `select id, data from reports where deleted_at is null and upper(substr(regexp_replace(id, '[^a-zA-Z0-9]', '', 'g'), 1, 6)) = $1 order by created_at desc limit 3`,
          [q.code]
        )
      : await pool.query(
          `select id, data from reports r where deleted_at is null and created_at > now() - interval '90 days' and (
             ${digits.replace("%s", "r.data->>'phone'")} = $1
             or r.client_id in (select id from clients c where c.deleted_at is null and (${digits.replace("%s", "c.data->>'phone'")} = $1 or ${digits.replace("%s", "c.data->>'whatsapp'")} = $1))
           ) order by created_at desc limit 10`,
          [q.phone]
        )
  ).rows as { id: string; data: Record<string, unknown> }[]
  return {
    kind: "ok",
    reports: rows.map(({ id, data }) => ({
      code: reportCode({ id }),
      category: String(data.category ?? "otro") as ReportCategory,
      status: String(data.status ?? "nuevo") as ReportStatus,
      createdAt: String(data.createdAt ?? ""),
      visitDate: data.status === "visita" ? String(data.visitDate ?? "") : "",
      resolvedAt: String(data.resolvedAt ?? ""),
    })),
  }
}

export type PublicBalance = {
  firstName: string
  status: PayStatus
  monthly: number
  owed: number
  lateMonths: string[]
  coveredUntil: string
  /** Next payment day to watch: the oldest unpaid month's, or the one after the last paid month. */
  nextDue: string
}
export type BalanceLookup = { kind: "ok"; balance: PublicBalance } | { kind: "no-match" } | { kind: "limited" } | null

const phoneHash = (key: string) => createHash("sha256").update(`${hashSalt()}|tel|${key}`).digest("hex").slice(0, 24)

export async function lookupBalance(phone: string, pppoe: string, sender: string): Promise<BalanceLookup> {
  if (!hasDatabase()) return null
  const pool = getPool()
  const key = phoneKey(phone)
  const ph = `bp:${phoneHash(key)}`
  if (!(await underLimit(pool, `b:${sender}`, BALANCE_PER_HOUR)) || !(await underLimit(pool, ph, FAILS_PER_PHONE))) return { kind: "limited" }
  await hit(pool, `b:${sender}`)
  const found = (
    await pool.query(
      `select id, data from clients where deleted_at is null
         and (right(regexp_replace(coalesce(data->>'phone', ''), '\\D', '', 'g'), 10) = $1 or right(regexp_replace(coalesce(data->>'whatsapp', ''), '\\D', '', 'g'), 10) = $1)
         and exists (select 1 from jsonb_array_elements(coalesce(data->'services', '[]'::jsonb)) s where lower(trim(s->>'pppoeUser')) = lower($2))
       limit 2`,
      [key, pppoe.trim()]
    )
  ).rows as { id: string; data: unknown }[]
  if (found.length !== 1 || !pppoe.trim()) {
    await hit(pool, ph)
    return { kind: "no-match" }
  }
  const client = decodeClient(found[0].data)
  if (!client) return { kind: "no-match" }
  client.id = found[0].id
  const payments = ((await pool.query(`select data from payments where deleted_at is null and client_id = $1`, [client.id])).rows as { data: unknown }[])
    .map((r) => decodePayment(r.data))
    .filter((p): p is Payment => p !== null)
    .map((p) => ({ ...p, clientId: client.id }))
  const today = todayInMexico()
  const l = ledger(client, payments, today)
  return {
    kind: "ok",
    balance: { firstName: client.name.trim().split(/\s+/)[0] ?? "", status: l.status, monthly: l.monthly, owed: Math.round(l.owed * 100) / 100, lateMonths: l.lateMonths, coveredUntil: l.coveredUntil, nextDue: l.nextDue },
  }
}
