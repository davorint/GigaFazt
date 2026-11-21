/**
 * The client portal (WispDavor → Portal, owner 2026-11-21: "Private link"; shows balance and what's due, payment
 * history, services and plan, and fault reports). Staff create a link per client in /interno; the client opens
 * /mi-cuenta#<token> and the page asks /api/mi-cuenta with the token. Only that client's data goes back: first name,
 * building/apartment, services (type, plan, monthly price, status), the Cobranza ledger, payments (date, amount, method)
 * and their reports of the last 90 days (code, problem, status, dates). Never notes, other people or staff names.
 *
 * Limits: 60 portal reads per hour per sender address, and wrong tokens count in the same bucket. Server code only.
 */
import "server-only"
import { randomBytes } from "node:crypto"
import { clientLabel, decodeClient, type Client } from "../clients/model"
import { getPool, hasDatabase } from "../db/client"
import { todayInMexico } from "../lead"
import { decodePayment, ledger, type Payment, type PayStatus } from "../payments/model"
import { hit, underLimit } from "../reports/limits"
import { reportCode, type ReportCategory, type ReportStatus } from "../reports/model"
import { newId } from "../survey/id"

export const PORTAL_READS_PER_HOUR = 60
/** 24 random bytes as base64url: 32 characters. */
export const newToken = () => randomBytes(24).toString("base64url")
export const TOKEN = /^[A-Za-z0-9_-]{32}$/

export type PortalLink = { id: string; clientId: string; token: string; createdAt: string; createdBy: string; revokedAt: string; lastSeenAt: string; seenCount: number }

const row = (r: Record<string, unknown>): PortalLink => ({
  id: String(r.id),
  clientId: String(r.client_id),
  token: String(r.token),
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : "",
  createdBy: String(r.created_by ?? ""),
  revokedAt: r.revoked_at instanceof Date ? r.revoked_at.toISOString() : "",
  lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : "",
  seenCount: Number(r.seen_count ?? 0),
})

export async function listLinks(): Promise<PortalLink[]> {
  return ((await getPool().query(`select * from portal_links order by created_at desc limit 5000`)).rows as Record<string, unknown>[]).map(row)
}

/** A new link for a client; the client's earlier links stay valid until revoked (the staff page revokes them first). */
export async function createLink(clientId: string, by: string): Promise<PortalLink> {
  const r = await getPool().query(`insert into portal_links (id, client_id, token, created_by) values ($1, $2, $3, $4) returning *`, [newId(), clientId, newToken(), by])
  return row(r.rows[0] as Record<string, unknown>)
}

export async function revokeLinks(clientId: string): Promise<number> {
  const r = await getPool().query(`update portal_links set revoked_at = now() where client_id = $1 and revoked_at is null`, [clientId])
  return r.rowCount ?? 0
}

export type PortalView = {
  firstName: string
  place: string
  services: { type: string; plan: string; monthly: number | null; status: string }[]
  balance: { status: PayStatus; monthly: number; owed: number; lateMonths: string[]; coveredUntil: string; nextDue: string }
  payments: { date: string; amount: number; method: string; reference: string }[]
  reports: { code: string; category: ReportCategory; status: ReportStatus; createdAt: string; resolvedAt: string }[]
  today: string
}
export type PortalLookup = { kind: "ok"; view: PortalView } | { kind: "no-match" } | { kind: "limited" } | null

/** The portal of the client a token belongs to (null without a database). */
export async function portalView(token: string, sender: string): Promise<PortalLookup> {
  if (!hasDatabase()) return null
  const pool = getPool()
  if (!(await underLimit(pool, `p:${sender}`, PORTAL_READS_PER_HOUR))) return { kind: "limited" }
  await hit(pool, `p:${sender}`)
  if (!TOKEN.test(token)) return { kind: "no-match" }
  const link = (await pool.query(`update portal_links set last_seen_at = now(), seen_count = seen_count + 1 where token = $1 and revoked_at is null returning client_id`, [token])).rows[0] as
    | { client_id: string }
    | undefined
  if (!link) return { kind: "no-match" }
  const found = (await pool.query(`select id, data from clients where id = $1 and deleted_at is null`, [link.client_id])).rows[0] as { id: string; data: unknown } | undefined
  const client = found ? decodeClient(found.data) : null
  if (!found || !client) return { kind: "no-match" }
  client.id = found.id
  const payments = ((await pool.query(`select data from payments where deleted_at is null and client_id = $1`, [client.id])).rows as { data: unknown }[])
    .map((r) => decodePayment(r.data))
    .filter((p): p is Payment => p !== null)
    .map((p) => ({ ...p, clientId: client.id }))
  const reports = (
    (await pool.query(`select id, data from reports where deleted_at is null and client_id = $1 and created_at > now() - interval '90 days' order by created_at desc limit 10`, [client.id])).rows as {
      id: string
      data: Record<string, unknown>
    }[]
  ).map(({ id, data }) => ({
    code: reportCode({ id }),
    category: String(data.category ?? "otro") as ReportCategory,
    status: String(data.status ?? "nuevo") as ReportStatus,
    createdAt: String(data.createdAt ?? ""),
    resolvedAt: String(data.resolvedAt ?? ""),
  }))
  const today = todayInMexico()
  return { kind: "ok", view: view(client, payments, reports, today) }
}

/** What the portal shows of a client (pure, for tests). */
export function view(client: Client, payments: Payment[], reports: PortalView["reports"], today: string): PortalView {
  const l = ledger(client, payments, today)
  return {
    firstName: client.name.trim().split(/\s+/)[0] ?? "",
    place: [client.building, client.tower, client.apartment].filter(Boolean).join(" · ") || clientLabel(client),
    services: client.services.filter((s) => s.status !== "cancelado").map((s) => ({ type: s.type, plan: s.plan, monthly: s.monthly, status: s.status })),
    balance: { status: l.status, monthly: l.monthly, owed: Math.round(l.owed * 100) / 100, lateMonths: l.lateMonths, coveredUntil: l.coveredUntil, nextDue: l.nextDue },
    payments: payments
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 24)
      .map((p) => ({ date: p.date, amount: p.amount, method: p.method, reference: p.reference })),
    reports,
    today,
  }
}
