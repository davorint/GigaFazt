/**
 * Facturama API Web for WispDavor's CFDIs (owner, 2026-11-21: Facturama, "Only who asks"). The issuer (RFC, regime, CSD
 * seals) is the Facturama account's own fiscal profile. Keys only on the host: FACTURAMA_USER, FACTURAMA_PASSWORD;
 * FACTURAMA_SANDBOX=1 uses the sandbox (test RFC EKU9003173C9 and Facturama's test seals).
 *
 * Endpoints from Facturama's own request collection (github.com/Facturama/facturama-api-collections, "API Web/CFDI
 * 4.0"): POST /3/cfdis (issue), GET /Cfdi/{pdf|xml}/issued/{id} (file, Base64 in JSON "Content"), POST
 * /Cfdi?cfdiType=issued&cfdiId=…&email=… (send), DELETE /Cfdi/{id}?type=issued&motive=… (cancel). HTTP Basic auth.
 * Server code only.
 */
import "server-only"
import type { Client } from "../clients/model"
import { getPool } from "../db/client"
import type { Payment } from "../payments/model"
import { cfdiBody, fiscalIssues, settingsReady, type CfdiSettings } from "./cfdi"

export const facturamaConfigured = () => Boolean(process.env.FACTURAMA_USER?.trim() && process.env.FACTURAMA_PASSWORD?.trim())
const host = () => (process.env.FACTURAMA_SANDBOX === "1" ? "https://apisandbox.facturama.mx" : "https://api.facturama.mx")
const headers = () => {
  const user = process.env.FACTURAMA_USER as string
  return { authorization: `Basic ${Buffer.from(`${user}:${process.env.FACTURAMA_PASSWORD}`).toString("base64")}`, "user-agent": user }
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${host()}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const b = body as { Message?: string; ModelState?: Record<string, string[]> } | string | null
    const detail = typeof b === "string" ? b : [b?.Message, ...Object.values(b?.ModelState ?? {}).flat()].filter(Boolean).join(" · ")
    throw new Error(`Facturama ${res.status}: ${String(detail).slice(0, 400)}`)
  }
  return body
}

export type IssueResult = { ok: true; id: string; uuid: string } | { ok: false; error: string }

/** Issues the CFDI of one payment of a client with fiscal data; at most one active CFDI per payment. */
export async function issueCfdi(c: Client, p: Payment, s: CfdiSettings, by: string, cardFunding = "", months = ""): Promise<IssueResult> {
  if (!settingsReady(s)) return { ok: false, error: "settings" }
  if (fiscalIssues(c.fiscal).length) return { ok: false, error: "fiscal" }
  const pool = getPool()
  const dup = (await pool.query(`select id from cfdis where payment_id = $1 and status = 'active' limit 1`, [p.id])).rows[0]
  if (dup) return { ok: false, error: "duplicate" }
  const r = (await call("/3/cfdis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cfdiBody(c, p, s, { cardFunding, months })) })) as {
    Id: string
    Serie?: string
    Folio?: string
    Complement?: { TaxStamp?: { Uuid?: string } }
  }
  const uuid = r.Complement?.TaxStamp?.Uuid ?? ""
  await pool.query(`insert into cfdis (id, client_id, payment_id, uuid, serie, folio, total, receiver_rfc, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
    r.Id,
    c.id,
    p.id,
    uuid,
    r.Serie ?? "",
    String(r.Folio ?? ""),
    p.amount,
    c.fiscal.rfc,
    by,
  ])
  return { ok: true, id: r.Id, uuid }
}

const ID = /^[\w-]{6,64}$/

/** The CFDI's PDF or XML (Facturama answers it in Base64). */
export async function cfdiFile(id: string, format: "pdf" | "xml"): Promise<Buffer> {
  if (!ID.test(id)) throw new Error("bad id")
  const r = (await call(`/Cfdi/${format}/issued/${encodeURIComponent(id)}`)) as { Content?: string }
  return Buffer.from((r.Content ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

export async function emailCfdi(id: string, email: string) {
  if (!ID.test(id)) throw new Error("bad id")
  await call(`/Cfdi?cfdiType=issued&cfdiId=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`, { method: "POST" })
}

/** Cancels at the SAT through Facturama (motive 02 = issued with errors, no related CFDI). */
export async function cancelCfdi(id: string, motive = "02") {
  if (!ID.test(id) || !/^0[1-4]$/.test(motive)) throw new Error("bad request")
  await call(`/Cfdi/${encodeURIComponent(id)}?type=issued&motive=${motive}`, { method: "DELETE" })
  await getPool().query(`update cfdis set status = 'cancelled', cancelled_at = now() where id = $1`, [id])
}
