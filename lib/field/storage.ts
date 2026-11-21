/**
 * Where field photos and signatures live (phase 5): the private Vercel Blob store on the host (`campo/<ref kind>/<ref
 * id>/<file id>`), or `field_files.bytes` without a store (local, dev database), like the contracts' files
 * (lib/contracts/storage.ts). Read here and sent by /api/interno/campo/<id> only to a signed-in session. Server code only.
 */
import "server-only"
import { get, put } from "@vercel/blob"
import { blobOn } from "../contracts/storage"
import { getPool } from "../db/client"
import type { FieldFileKind, JobRef } from "./model"

export async function saveFieldFile(f: { id: string; ref: JobRef; kind: FieldFileKind; name: string; mime: string; bytes: Buffer; by: string }) {
  let path = ""
  if (blobOn()) {
    path = `campo/${f.ref.kind}/${f.ref.id}/${f.id}`
    await put(path, f.bytes, { access: "private", contentType: f.mime, addRandomSuffix: false })
  }
  await getPool().query(
    `insert into field_files (id, ref_kind, ref_id, kind, name, mime, size, bytes, blob_path, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [f.id, f.ref.kind, f.ref.id, f.kind, f.name, f.mime, f.bytes.length, path ? null : f.bytes, path, f.by]
  )
}

export async function readFieldFile(id: string): Promise<{ name: string; mime: string; size: number; body: BodyInit } | null> {
  const f = (await getPool().query<{ name: string; mime: string; bytes: Buffer | null; blob_path: string }>(`select name, mime, bytes, blob_path from field_files where id = $1 and deleted_at is null`, [id])).rows[0]
  if (!f) return null
  if (!f.blob_path) return f.bytes ? { name: f.name, mime: f.mime, size: f.bytes.length, body: new Uint8Array(f.bytes) as Uint8Array<ArrayBuffer> } : null
  const b = await get(f.blob_path, { access: "private", useCache: false })
  if (!b || b.statusCode !== 200) return null
  return { name: f.name, mime: f.mime, size: b.blob.size, body: b.stream }
}

export async function removeFieldFile(id: string) {
  await getPool().query(`update field_files set deleted_at = now() where id = $1 and deleted_at is null`, [id])
}
