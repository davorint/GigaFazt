import type { NextRequest } from "next/server"
import { cleanName, sniffMime } from "@/lib/contracts/files"
import { hasDatabase } from "@/lib/db/client"
import { FIELD_FILE_KINDS, MAX_FIELD_BYTES, type FieldFileKind } from "@/lib/field/model"
import { saveFieldFile } from "@/lib/field/storage"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { newId } from "@/lib/survey/id"

const ID = /^[\w-]{6,64}$/
const IMAGES = ["image/jpeg", "image/png", "image/webp"]

/**
 * POST /api/interno/campo (multipart: `tipo` = agenda | reporte, `ref` = its id, `clase` = foto | firma, `archivo`):
 * keeps a field photo or the client's signature (phase 5, Técnico) and answers its entry, which the phone adds to the
 * job's record. Images only (type from the bytes); signed in only.
 */
export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FIELD_BYTES + 64 * 1024) return json({ error: "too-big" }, 413)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: "bad-form" }, 400)
  }
  const refKind = String(form.get("tipo") ?? "")
  const refId = String(form.get("ref") ?? "")
  const kind = String(form.get("clase") ?? "foto")
  const file = form.get("archivo")
  if ((refKind !== "agenda" && refKind !== "reporte") || !ID.test(refId) || !(FIELD_FILE_KINDS as readonly string[]).includes(kind) || !(file instanceof File)) return json({ error: "bad-form" }, 400)
  if (file.size > MAX_FIELD_BYTES) return json({ error: "too-big" }, 413)
  if (file.size === 0) return json({ error: "empty" }, 400)
  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime || !IMAGES.includes(mime)) return json({ error: "bad-type" }, 415)
  const id = newId()
  const name = cleanName(file.name) || `${kind}.${mime.split("/")[1]}`
  try {
    await saveFieldFile({ id, ref: { kind: refKind, id: refId }, kind: kind as FieldFileKind, name, mime, bytes, by: await editorOf(request) })
    return json({ ok: true, file: { id, kind, name } })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
