import { NextResponse } from "next/server"

/**
 * Stub status endpoint. Until a status provider is configured
 * (BUSINESS.md → Status page provider), status is "unknown" and the nav badge
 * stays hidden (hard rule #3). When a provider URL is set via STATUS_PROVIDER_URL
 * this handler should fetch and map its uptime series.
 */
export type StatusResponse = {
  status: "operational" | "degraded" | "unknown"
  uptime90d: number[]
}

export async function GET() {
  const body: StatusResponse = { status: "unknown", uptime90d: [] }
  return NextResponse.json(body)
}
