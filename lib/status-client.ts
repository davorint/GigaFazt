"use client"

import type { StatusResponse } from "./status"

const UNKNOWN: StatusResponse = { status: "unknown", uptime90d: [] }
let request: Promise<StatusResponse> | null = null

/** One /api/status request per page load, shared by the badge and uptime bar. */
export function fetchStatus(): Promise<StatusResponse> {
  request ??= fetch("/api/status")
    .then((r) => (r.ok ? (r.json() as Promise<StatusResponse>) : UNKNOWN))
    .then((d) => ({
      status: d?.status ?? "unknown",
      uptime90d: Array.isArray(d?.uptime90d) ? d.uptime90d : [],
    }))
    .catch(() => UNKNOWN)
  return request
}
