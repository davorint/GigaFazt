import type { StateCode } from "../types"
import type { RegionMetrics, TelemetrySnapshot, TelemetrySource } from "./types"

/**
 * Simulated telemetry. All values are fabricated for the live-dashboard feel and
 * MUST be rendered with a SIMULACIÓN / DEMO DATA tag (hard rule #2). Never treat
 * these as real network figures. Emits at ~1.5 Hz.
 */

const REGION_SEEDS: Record<StateCode, Omit<RegionMetrics, "p50LatencyMs">> = {
  CDMX: { state: "CDMX", coveragePct: 62, availability: 99.98, activePops: 9 },
  MEX: { state: "MEX", coveragePct: 41, availability: 99.95, activePops: 6 },
  MOR: { state: "MOR", coveragePct: 28, availability: 99.9, activePops: 3 },
}

function jitter(base: number, spread: number): number {
  return base + (Math.random() - 0.5) * spread
}

function snapshot(): TelemetrySnapshot {
  const p50 = jitter(0.9, 0.4)
  return {
    t: Date.now(),
    downGbps: Math.max(0, jitter(42, 14)),
    upGbps: Math.max(0, jitter(40, 14)),
    p50Ms: Math.max(0.2, p50),
    p99Ms: Math.max(0.5, jitter(3.4, 1.2)),
    jitterMs: Math.max(0, jitter(0.4, 0.3)),
    lossPct: Math.max(0, jitter(0.02, 0.03)),
    regions: (Object.keys(REGION_SEEDS) as StateCode[]).map((s) => ({
      ...REGION_SEEDS[s],
      p50LatencyMs: Math.max(0.3, jitter(1.1, 0.5)),
    })),
    simulated: true,
  }
}

export function createMockTelemetry(hz = 1.5): TelemetrySource {
  return {
    subscribe(cb) {
      cb(snapshot())
      const interval = setInterval(() => cb(snapshot()), 1000 / hz)
      return () => clearInterval(interval)
    },
  }
}

export const mockTelemetry = createMockTelemetry()
