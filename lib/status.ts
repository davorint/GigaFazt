/**
 * /api/status contract (hard rule #3) and pure helpers for the uptime bar.
 * `uptime90d` is daily availability as a fraction (0–1), oldest first.
 */
export type ServiceStatus = "operational" | "degraded" | "unknown"

export interface StatusResponse {
  status: ServiceStatus
  uptime90d: number[]
}

export type UptimeLevel = "ok" | "warn" | "down"

/** ≥ 99.9% ok · ≥ 99% warn · below that down. */
export function uptimeLevel(fraction: number): UptimeLevel {
  if (fraction >= 0.999) return "ok"
  if (fraction >= 0.99) return "warn"
  return "down"
}

/** Mean availability over the window, or null when there is no data. */
export function uptimeAverage(days: number[]): number | null {
  const valid = days.filter((d) => Number.isFinite(d) && d >= 0 && d <= 1)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

/** True only when the endpoint returned something we may show (hard rule #3). */
export function hasUptime(s: StatusResponse | null): s is StatusResponse {
  return !!s && s.status !== "unknown" && uptimeAverage(s.uptime90d) !== null
}
