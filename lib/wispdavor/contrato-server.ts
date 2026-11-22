/** The client contract on the server (phase 15; rules in lib/wispdavor/contrato.ts). Server code only. */
import "server-only"
import { createHash } from "node:crypto"
import type { Client } from "../clients/model"
import { newContract, type ContractFile } from "../contracts/model"
import { saveFile } from "../contracts/storage"
import { getPool } from "../db/client"
import { simplePdf } from "../pdf/simple"
import { sendText } from "../reports/notify"
import { newId } from "../survey/id"
import { EMPTY_TEMPLATE, contractLines, decodeTemplate, fillTemplate, hasTemplate, validSigner, type Template } from "./contrato"

const KEY = "contrato_cliente"
const BY = "Portal del cliente"
/** The signed copies' folio: PORTAL-v<version of the text>. */
const folio = (v: number) => `PORTAL-v${v}`

export async function getTemplate(): Promise<Template> {
  const r = (await getPool().query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: unknown } | undefined
  return r ? decodeTemplate(r.value) : EMPTY_TEMPLATE
}

/** Saves the text; a changed text is a new version (clients who signed an earlier one are asked to sign again). */
export async function saveTemplate(title: string, body: string, by: string): Promise<Template> {
  const cur = await getTemplate()
  const next = decodeTemplate({ title, body })
  const changed = next.title !== cur.title || next.body !== cur.body
  const t: Template = changed ? { ...next, version: cur.version + 1, updatedAt: new Date().toISOString(), updatedBy: by } : cur
  if (changed)
    await getPool().query(
      `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [KEY, t, by]
    )
  return t
}

/** The signed copy of this client for this version, if any (when it was signed). */
async function signedAt(clientId: string, version: number): Promise<string> {
  const r = (await getPool().query(`select data->>'signedDate' as d from contracts where deleted_at is null and kind = 'cliente' and data->>'clientId' = $1 and data->>'number' = $2 limit 1`, [clientId, folio(version)])).rows[0] as
    | { d: string }
    | undefined
  return r?.d ?? ""
}

export type PortalContract = { title: string; text: string; version: number; signed: string } | null

/** What the portal shows: nothing without a text; else the text filled with the client's data and whether it's signed. */
export async function portalContract(c: Client, today: string): Promise<PortalContract> {
  const t = await getTemplate()
  if (!hasTemplate(t)) return null
  return { title: t.title, text: fillTemplate(t.body, c, today), version: t.version, signed: await signedAt(c.id, t.version) }
}

export type SignResult = { kind: "signed" | "already"; date: string } | { kind: "no-contract" | "stale" | "name" | "signature" }

/**
 * Signs the current version: the filled text's fingerprint, a PDF of it with the signature details, and the drawn
 * signature as an image, in a new contract record (kind "cliente") in Legal → Contratos. `version` must be the one the
 * client read (a text changed meanwhile is "stale": they read it again).
 */
export async function signContract(c: Client, p: { version: number; name: string; signature: Buffer; ipHash: string; today: string }): Promise<SignResult> {
  const t = await getTemplate()
  if (!hasTemplate(t)) return { kind: "no-contract" }
  if (p.version !== t.version) return { kind: "stale" }
  if (!validSigner(p.name)) return { kind: "name" }
  if (p.signature.length < 200) return { kind: "signature" }
  const done = await signedAt(c.id, t.version)
  if (done) return { kind: "already", date: done }
  const text = fillTemplate(t.body, c, p.today)
  const at = new Date().toISOString()
  const hash = createHash("sha256").update(`${t.title}\n${text}`).digest("hex")
  const pdf = Buffer.from(simplePdf(contractLines(t.title, text, { name: p.name.trim(), at, ipHash: p.ipHash, hash, version: t.version }), t.title))
  const contract = newContract({
    kind: "cliente",
    title: `${t.title} (v${t.version})`.slice(0, 200),
    party: p.name.trim(),
    clientId: c.id,
    siteId: c.siteId,
    number: folio(t.version),
    signedDate: p.today,
    startDate: p.today,
    monthly: c.services.filter((s) => s.status !== "cancelado").reduce((a, s) => a + (s.monthly ?? 0), 0),
    notes: `Firmado desde el portal del cliente. Huella SHA-256 del texto: ${hash}`,
    by: BY,
    createdAt: at,
    updatedAt: at,
  })
  const files: ContractFile[] = [
    { id: newId(), name: `contrato-v${t.version}.pdf`, size: pdf.length, mime: "application/pdf", at, by: BY },
    { id: newId(), name: `firma-v${t.version}.png`, size: p.signature.length, mime: "image/png", at, by: BY },
  ]
  contract.files = files
  const pool = getPool()
  const db = await pool.connect()
  try {
    await db.query("begin")
    await db.query(`insert into contracts (id, data, version, updated_by, kind, title, end_date) values ($1, $2, 1, $3, $4, $5, $6)`, [contract.id, contract, BY, contract.kind, contract.title, contract.endDate])
    await db.query(`insert into contract_versions (contract_id, version, data, saved_by) values ($1, 1, $2, $3)`, [contract.id, contract, BY])
    await db.query("commit")
  } catch (e) {
    await db.query("rollback").catch(() => undefined)
    throw e
  } finally {
    db.release()
  }
  await saveFile({ id: files[0].id, contractId: contract.id, name: files[0].name, mime: files[0].mime, bytes: pdf, by: BY })
  await saveFile({ id: files[1].id, contractId: contract.id, name: files[1].name, mime: files[1].mime, bytes: p.signature, by: BY })
  await sendText("contrato", `✍️ ${c.name || c.id} firmó su contrato (v${t.version}) desde su portal. Legal → Contratos.`).catch(() => undefined)
  return { kind: "signed", date: p.today }
}
