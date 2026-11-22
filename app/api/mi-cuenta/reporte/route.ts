import { NextResponse } from "next/server"
import { cleanName, sniffMime } from "@/lib/contracts/files"
import { MAX_FIELD_BYTES } from "@/lib/field/model"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { clientForToken } from "@/lib/wispdavor/portal-server"
import { reportFault } from "@/lib/wispdavor/portal-requests"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }
const IMAGES = ["image/jpeg", "image/png", "image/webp"]

/**
 * POST /api/mi-cuenta/reporte (multipart: token, categoria, descripcion, foto optional): a fault the client reports from
 * their portal (phase 9): a report in Reportes already matched to them, with the photo (an image, at most 4 MB). The
 * portal's own limits apply (lookups per IP); a repeat within a day answers the open report's code.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FIELD_BYTES + 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400, headers: HEADERS })
  }
  const token = String(form.get("token") ?? "").trim()
  const category = String(form.get("categoria") ?? "").slice(0, 40)
  const description = String(form.get("descripcion") ?? "").slice(0, 4000)
  const file = form.get("foto")
  let photo: { bytes: Buffer; mime: string; name: string } | undefined
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FIELD_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = sniffMime(bytes)
    if (!mime || !IMAGES.includes(mime)) return NextResponse.json({ error: "bad_type" }, { status: 415, headers: HEADERS })
    photo = { bytes, mime, name: cleanName(file.name) || `foto.${mime.split("/")[1]}` }
  }
  try {
    const found = await clientForToken(token, ipHash(clientIp(request.headers)), false)
    if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (found.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (found.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    const r = await reportFault(found.client, { category, description, photo })
    if (r.kind === "bad-category" || r.kind === "empty") return NextResponse.json({ error: r.kind }, { status: 400, headers: HEADERS })
    return NextResponse.json({ ok: true, ...r }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
