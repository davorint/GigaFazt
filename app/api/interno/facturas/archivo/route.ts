import type { NextRequest } from "next/server"
import { json, requireArea, requireInterno } from "@/lib/internal-api"
import { INTERNAL_HEADERS } from "@/lib/internal-pages"
import { cfdiFile, facturamaConfigured } from "@/lib/wispdavor/facturama-server"

/** GET /api/interno/facturas/archivo?id=<facturama id>&formato=pdf|xml: the CFDI's file, downloaded. Signed in only. */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  const forbidden = await requireArea(request, "payments")
  if (forbidden) return forbidden
  if (!facturamaConfigured()) return json({ error: "not-configured" }, 409)
  const p = request.nextUrl.searchParams
  const id = p.get("id") ?? ""
  const format = p.get("formato") === "xml" ? "xml" : "pdf"
  try {
    const file = await cfdiFile(id, format)
    return new Response(new Uint8Array(file), {
      headers: {
        ...INTERNAL_HEADERS,
        "Content-Type": format === "pdf" ? "application/pdf" : "application/xml",
        "Content-Disposition": `attachment; filename="cfdi-${id.replace(/[^\w-]/g, "")}.${format}"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 300) : "error" }, 500)
  }
}
