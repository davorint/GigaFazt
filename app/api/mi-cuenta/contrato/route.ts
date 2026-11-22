import { NextResponse } from "next/server"
import { sniffMime } from "@/lib/contracts/files"
import { todayInMexico } from "@/lib/lead"
import { clientIp, ipHash } from "@/lib/reports/limits"
import { portalContract, signContract } from "@/lib/wispdavor/contrato-server"
import { clientForToken } from "@/lib/wispdavor/portal-server"

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }
const MAX_SIGNATURE = 300 * 1024

/**
 * The client's contract from their portal (phase 15). JSON {token}: the text filled with their data and whether they
 * signed it (null when the owner hasn't set a text). Multipart {token, version, nombre, firma (PNG)}: signs it.
 */
export async function POST(request: Request) {
  const multipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data")
  if (Number(request.headers.get("content-length") ?? 0) > MAX_SIGNATURE + 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS })
  let token = ""
  let form: FormData | null = null
  try {
    if (multipart) {
      form = await request.formData()
      token = String(form.get("token") ?? "").trim()
    } else token = String(((await request.json()) as { token?: unknown }).token ?? "").trim()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: HEADERS })
  }
  try {
    const ip = ipHash(clientIp(request.headers))
    const found = await clientForToken(token, ip, false)
    if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
    if (found.kind === "limited") return NextResponse.json({ error: "too_many" }, { status: 429, headers: HEADERS })
    if (found.kind === "no-match") return NextResponse.json({ error: "no_match" }, { status: 404, headers: HEADERS })
    const today = todayInMexico()
    if (!form) return NextResponse.json({ ok: true, contract: await portalContract(found.client, today) }, { headers: HEADERS })
    const file = form.get("firma")
    if (!(file instanceof File) || file.size > MAX_SIGNATURE) return NextResponse.json({ error: "signature" }, { status: 400, headers: HEADERS })
    const bytes = Buffer.from(await file.arrayBuffer())
    if (sniffMime(bytes) !== "image/png") return NextResponse.json({ error: "signature" }, { status: 400, headers: HEADERS })
    const r = await signContract(found.client, { version: Number(form.get("version") ?? 0), name: String(form.get("nombre") ?? "").slice(0, 200), signature: bytes, ipHash: ip, today })
    if (r.kind === "signed" || r.kind === "already") return NextResponse.json({ ok: true, ...r }, { headers: HEADERS })
    return NextResponse.json({ error: r.kind }, { status: r.kind === "stale" ? 409 : 400, headers: HEADERS })
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS })
  }
}
