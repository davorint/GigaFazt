/**
 * Where the signed copies of the contracts live (owner, 2026-11-21: "i added vercel blob"):
 * - on the host, the private Vercel Blob store connected to the project (BLOB_STORE_ID with the project's OIDC token,
 *   or BLOB_READ_WRITE_TOKEN): pathname `contratos/<contract>/<file id>`, private, never linked directly;
 * - without a store (local, dev database), in `contract_files.bytes`.
 * The listing data (name, type, size, who, when, deleted) is always in `contract_files`. Either way the file is read
 * here and sent by /api/interno/archivos/<id> only to a signed-in session. Server code only.
 */
import "server-only"
import { get, put } from "@vercel/blob"
import { getPool } from "../db/client"

export const blobOn = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)

export const blobPathOf = (contractId: string, id: string) => `contratos/${contractId}/${id}`

/** Keeps a file; answers when it was stored. */
export async function saveFile(f: { id: string; contractId: string; name: string; mime: string; bytes: Buffer; by: string }): Promise<Date> {
  let path = ""
  if (blobOn()) {
    path = blobPathOf(f.contractId, f.id)
    await put(path, f.bytes, { access: "private", contentType: f.mime, addRandomSuffix: false })
  }
  const r = await getPool().query<{ uploaded_at: Date }>(
    `insert into contract_files (id, contract_id, name, mime, size, bytes, blob_path, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning uploaded_at`,
    [f.id, f.contractId, f.name, f.mime, f.bytes.length, path ? null : f.bytes, path, f.by]
  )
  return r.rows[0].uploaded_at
}

/** A kept file (not deleted), or null. */
export async function readFile(id: string): Promise<{ name: string; mime: string; size: number; body: BodyInit } | null> {
  const r = await getPool().query<{ name: string; mime: string; size: number; bytes: Buffer | null; blob_path: string }>(
    `select name, mime, size, bytes, blob_path from contract_files where id = $1 and deleted_at is null`,
    [id]
  )
  const f = r.rows[0]
  if (!f) return null
  if (!f.blob_path) return f.bytes ? { name: f.name, mime: f.mime, size: f.bytes.length, body: new Uint8Array(f.bytes) as Uint8Array<ArrayBuffer> } : null
  const b = await get(f.blob_path, { access: "private", useCache: false })
  if (!b || b.statusCode !== 200) return null
  return { name: f.name, mime: f.mime, size: b.blob.size, body: b.stream }
}

/** Marks a file deleted (its bytes stay where they are, like other deleted records). */
export async function removeFile(id: string): Promise<void> {
  await getPool().query(`update contract_files set deleted_at = now() where id = $1 and deleted_at is null`, [id])
}
