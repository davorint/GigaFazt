import { NextResponse } from "next/server"
import type { StatusResponse } from "@/lib/status"

/**
 * Stub status endpoint. Until a status provider is configured
 * (BUSINESS.md → Status page provider), status is "unknown": the nav badge and
 * the 90-day uptime bar stay hidden (hard rule #3). When a provider URL is set
 * via STATUS_PROVIDER_URL this handler should fetch and map its uptime series.
 */
export async function GET() {
  const body: StatusResponse = { status: "unknown", uptime90d: [] }
  return NextResponse.json(body)
}
