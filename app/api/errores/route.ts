import { NextResponse } from "next/server"
import { reportError } from "@/lib/errors/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { clientIp, hit, ipHash, underLimit } from "@/lib/reports/limits"

/** Reports from one sender per hour (a crash loop on one phone shouldn't use up the hourly alerts). */
const PER_SENDER = 10

/**
 * A page that crashed in a browser (the error screens send it): { message, path, digest }. Logged and passed to the
 * alert channel by lib/errors/server.ts. Small bodies only; always answers 204 so a broken page never retries.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "")
  if (raw.length > 2048) return new NextResponse(null, { status: 204 })
  let body: { message?: unknown; path?: unknown; digest?: unknown } = {}
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : ""
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : ""
  if (!message) return new NextResponse(null, { status: 204 })
  if (hasDatabase()) {
    try {
      const pool = getPool()
      const key = `ec:${ipHash(clientIp(request.headers))}`
      if (!(await underLimit(pool, key, PER_SENDER))) return new NextResponse(null, { status: 204 })
      await hit(pool, key)
    } catch {
      // Keep going: the report is only logged and deduplicated.
    }
  }
  await reportError({ source: "client", message, path, digest: typeof body.digest === "string" ? body.digest.slice(0, 40) : undefined }).catch(() => undefined)
  return new NextResponse(null, { status: 204 })
}
