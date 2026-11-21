import type { NextRequest } from "next/server"
import { hasDatabase } from "@/lib/db/client"
import { saveFile } from "@/lib/contracts/storage"
import { editorOf, json, requireInterno } from "@/lib/internal-api"
import { cleanName, MAX_BYTES, sniffMime } from "@/lib/contracts/files"
import { newId } from "@/lib/survey/id"

const ID = /^[\w-]{6,64}$/

/**
 * POST /api/interno/archivos (multipart: `contrato` = the contract's id, `archivo` = the file): keeps a signed copy of a
 * contract (lib/contracts/files.ts) and answers its listing entry, which the phone adds to the contract's record.
 * Signed in only; the type comes from the file's bytes. Stored in the private Blob store (lib/contracts/storage.ts).
 */
export async function POST(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return json({ error: "too-big" }, 413)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: "bad-form" }, 400)
  }
  const contract = String(form.get("contrato") ?? "")
  const file = form.get("archivo")
  if (!ID.test(contract) || !(file instanceof File)) return json({ error: "bad-form" }, 400)
  if (file.size > MAX_BYTES) return json({ error: "too-big" }, 413)
  if (file.size === 0) return json({ error: "empty" }, 400)
  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime) return json({ error: "bad-type" }, 415)
  const id = newId()
  const name = cleanName(file.name)
  const by = await editorOf(request)
  try {
    const at = await saveFile({ id, contractId: contract, name, mime, bytes, by })
    return json({ ok: true, file: { id, name, size: bytes.length, mime, at: at.toISOString(), by } })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
