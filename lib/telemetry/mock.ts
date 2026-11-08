import type { StateCode } from "../types"
import type { LinkSnapshot, LinkTelemetrySource, RegionMetrics, TelemetrySnapshot, TelemetrySource } from "./types"

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

function snapshot(t = Date.now()): TelemetrySnapshot {
  const p50 = jitter(0.9, 0.4)
  return {
    t,
    // Real traffic is download-heavy even on symmetric capacity.
    downGbps: Math.max(0, jitter(6.2, 1.6)),
    upGbps: Math.max(0, jitter(2.4, 0.8)),
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
    history(count) {
      const step = 1000 / hz
      const now = Date.now()
      return Array.from({ length: count }, (_, i) => snapshot(now - (count - 1 - i) * step))
    },
  }
}

export const mockTelemetry = createMockTelemetry()


/**
 * Simulated business link for the /empresas NOC panel (SIMULACIÓN tag
 * required). A 10 Gbps example link with a backup route: `cutPrimary()` drops
 * traffic while the cut is "detected" (DETECT_MS), then moves it to the
 * backup path; `restorePrimary()` brings it back. Illustrative only: real
 * switchover times depend on each link's design, and none are claimed.
 */
const LINK_CONTRACTED_GBPS = 10
const FLOOR_SHARE = [0.18, 0.31, 0.27, 0.24]
const DETECT_MS = 1400

export function createMockLinkTelemetry(hz = 2): LinkTelemetrySource {
  let primaryUp = true
  let cutAt = 0
  const listeners = new Set<(s: LinkSnapshot) => void>()

  const path = (t: number): LinkSnapshot["activePath"] =>
    primaryUp ? "primary" : t - cutAt < DETECT_MS ? null : "backup"

  const linkSnapshot = (t = Date.now()): LinkSnapshot => {
    const active = path(t)
    // Smooth daily-ish wave + noise, so the graph reads as traffic, not static.
    const wave = 0.5 + 0.5 * Math.sin(t / 9000)
    const down = active === null ? jitter(0.05, 0.05) : Math.max(0.3, jitter(4.2 + 1.8 * wave, 1.2))
    const up = active === null ? jitter(0.03, 0.03) : Math.max(0.2, jitter(2.6 + 1.2 * wave, 0.9))
    return {
      t,
      downGbps: Math.max(0, Math.min(LINK_CONTRACTED_GBPS, down)),
      upGbps: Math.max(0, Math.min(LINK_CONTRACTED_GBPS, up)),
      contractedGbps: LINK_CONTRACTED_GBPS,
      floorsGbps: FLOOR_SHARE.map((s) => Math.max(0, (down + up) * s * jitter(1, 0.25))),
      latencyMs: Math.max(0.3, jitter(active === "backup" ? 1.6 : 0.9, 0.35)),
      primaryUp,
      activePath: active,
      simulated: true,
    }
  }

  const emit = () => {
    const s = linkSnapshot()
    listeners.forEach((cb) => cb(s))
  }

  return {
    subscribe(cb) {
      listeners.add(cb)
      cb(linkSnapshot())
      const interval = setInterval(() => cb(linkSnapshot()), 1000 / hz)
      return () => {
        listeners.delete(cb)
        clearInterval(interval)
      }
    },
    history(count) {
      const step = 1000 / hz
      const now = Date.now()
      return Array.from({ length: count }, (_, i) => linkSnapshot(now - (count - 1 - i) * step))
    },
    now: () => linkSnapshot(),
    cutPrimary() {
      if (!primaryUp) return
      primaryUp = false
      cutAt = Date.now()
      emit()
    },
    restorePrimary() {
      if (primaryUp) return
      primaryUp = true
      emit()
    },
  }
}
