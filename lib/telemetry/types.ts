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

/** One business link (the /empresas NOC panel). Simulated only (hard rule #2). */
export interface LinkSnapshot {
  t: number
  downGbps: number
  upGbps: number
  /** The link's contracted capacity, Gbps (1:1 on Internet dedicado). */
  contractedGbps: number
  /** Traffic per floor of the example building, Gbps (bottom floor first). */
  floorsGbps: number[]
  latencyMs: number
  primaryUp: boolean
  /** Which path carries the traffic; null while the cut is being detected. */
  activePath: "primary" | "backup" | null
  simulated: boolean
}

export interface LinkTelemetrySource {
  subscribe(cb: (snapshot: LinkSnapshot) => void): () => void
  history(count: number): LinkSnapshot[]
  /** The current state, without waiting for the next tick (reduced motion). */
  now(): LinkSnapshot
  cutPrimary(): void
  restorePrimary(): void
}
