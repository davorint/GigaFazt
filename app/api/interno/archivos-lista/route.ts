import type { NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"

/**
 * GET /api/interno/archivos-lista: every kept file (contracts' signed copies and the technicians' photos and
 * signatures) with where to download it, for "Descargar archivos" (the JSON backup has the records, not the files).
 * The phone downloads them one by one and packs them in a zip (the host can't answer one big zip). Signed in only.
 */
/** A safe piece of a path inside the zip (no slashes, colons or other characters file systems refuse). */
const part = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 60) || "_"

export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  try {
    const pool = getPool()
    const contracts = (await pool.query(`select f.id, f.name, f.size, f.uploaded_at, coalesce(c.data->>'party', '') as owner from contract_files f left join contracts c on c.id = f.contract_id where f.deleted_at is null order by f.uploaded_at`)).rows as { id: string; name: string; size: number; uploaded_at: Date; owner: string }[]
    const field = (await pool.query(`select id, name, size, uploaded_at, kind, ref_kind, ref_id from field_files where deleted_at is null order by uploaded_at`)).rows as { id: string; name: string; size: number; uploaded_at: Date; kind: string; ref_kind: string; ref_id: string }[]
    return json({
      ok: true,
      files: [
        ...contracts.map((f) => ({ url: `/api/interno/archivos/${f.id}`, path: `contratos/${f.owner ? `${part(f.owner)}/` : ""}${f.id}-${part(f.name)}`, size: f.size, at: f.uploaded_at.toISOString() })),
        ...field.map((f) => ({ url: `/api/interno/campo/${f.id}`, path: `campo/${part(f.ref_kind)}-${part(f.ref_id)}/${part(f.kind)}-${f.id}-${part(f.name)}`, size: f.size, at: f.uploaded_at.toISOString() })),
      ],
    })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
