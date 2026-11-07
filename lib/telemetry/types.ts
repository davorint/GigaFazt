import type { StateCode } from "../types"

export interface RegionMetrics {
  state: StateCode
  coveragePct: number
  p50LatencyMs: number
  availability: number
  activePops: number
}

export interface TelemetrySnapshot {
  t: number
  downGbps: number
  upGbps: number
  p50Ms: number
  p99Ms: number
  jitterMs: number
  lossPct: number
  regions: RegionMetrics[]
  /** Always true for the mock source; drives the SIMULACIÓN tag (hard rule #2). */
  simulated: boolean
}

export interface TelemetrySource {
  subscribe(cb: (snapshot: TelemetrySnapshot) => void): () => void
  /** Optional backfill of the last `count` snapshots (oldest first), e.g. for a
   *  static frame under reduced motion or to pre-fill a rolling window. */
  history?(count: number): TelemetrySnapshot[]
}
