"use client"

/**
 * Real speed test of the visitor's *current* connection (SPEC §4), using
 * @cloudflare/speedtest against Cloudflare's public endpoints. The library is
 * dynamically imported on demand, so it never ships in the initial bundle.
 *
 * - Short measurement plan + 30 s hard cap, so it never runs away. A run cut
 *   short by the cap, or with < 0.1 Mbps either way, is rejected, not shown.
 * - Cancellable via AbortSignal (pauses the engine and rejects with "aborted").
 * - Cloudflare's result logging (logAimApiUrl) is disabled: nothing about the
 *   visitor's result is sent anywhere by us or the library.
 */

export interface SpeedResult {
  downMbps: number
  upMbps: number
  pingMs: number
  jitterMs: number | null
}

export type SpeedPhase = "latency" | "download" | "upload"

export interface SpeedProgress {
  phase: SpeedPhase
  /** 0–1 across the whole measurement plan. */
  progress: number
  downMbps?: number
  upMbps?: number
  pingMs?: number
}

const MEASUREMENTS = [
  { type: "latency", numPackets: 1 },
  { type: "download", bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: "latency", numPackets: 15 },
  { type: "download", bytes: 1e5, count: 6 },
  { type: "download", bytes: 1e6, count: 6 },
  { type: "upload", bytes: 1e5, count: 6 },
  { type: "upload", bytes: 1e6, count: 6 },
  { type: "download", bytes: 1e7, count: 4 },
  { type: "upload", bytes: 1e7, count: 3 },
  { type: "download", bytes: 2.5e7, count: 3 },
  { type: "upload", bytes: 2.5e7, count: 2 },
] as const

const MAX_MS = 30_000

const toMbps = (bps: number | undefined) =>
  bps === undefined ? undefined : Math.round((bps / 1e6) * 10) / 10

export async function runSpeedTest(
  onProgress: (p: SpeedProgress) => void,
  signal: AbortSignal
): Promise<SpeedResult> {
  const { default: SpeedTest } = await import("@cloudflare/speedtest")
  if (signal.aborted) throw new Error("aborted")

  return new Promise<SpeedResult>((resolveOuter, rejectOuter) => {
    const onAbort = () => {
      engine.pause()
      reject(new Error("aborted"))
    }
    const resolve = (r: SpeedResult) => {
      signal.removeEventListener("abort", onAbort)
      resolveOuter(r)
    }
    const reject = (e: Error) => {
      signal.removeEventListener("abort", onAbort)
      rejectOuter(e)
    }

    const engine = new SpeedTest({
      autoStart: false,
      logAimApiUrl: null,
      logMeasurementApiUrl: null,
      measureDownloadLoadedLatency: false,
      measureUploadLoadedLatency: false,
      abortTestDuration: MAX_MS,
      measurements: MEASUREMENTS.map((m) => ({ ...m })),
    })

    let phase: SpeedPhase = "latency"
    let step = 0
    const emit = () => {
      const s = engine.results.getSummary()
      onProgress({
        phase,
        progress: Math.min(0.99, step / MEASUREMENTS.length),
        downMbps: toMbps(s.download),
        upMbps: toMbps(s.upload),
        pingMs: s.latency === undefined ? undefined : Math.round(s.latency),
      })
    }

    engine.onPhaseChange = ({ measurementId, measurement }) => {
      step = measurementId
      if (measurement.type !== "packetLoss") phase = measurement.type
      emit()
    }
    engine.onResultsChange = emit

    let failures = 0
    engine.onError = () => {
      // The engine keeps going after a failed request; give up after a few.
      if (++failures >= 3) {
        engine.pause()
        reject(new Error("speedtest_failed"))
      }
    }

    engine.onFinish = (results) => {
      const s = results.getSummary()
      // Hitting the time cap means partial data: don't present it as a real result.
      if ((results.getTotalDurationMs() ?? 0) >= MAX_MS - 500) {
        reject(new Error("speedtest_truncated"))
        return
      }
      if (!s.download || !s.upload || s.download < 1e5 || s.upload < 1e5 || s.latency === undefined) {
        reject(new Error("speedtest_incomplete"))
        return
      }
      resolve({
        downMbps: toMbps(s.download)!,
        upMbps: toMbps(s.upload)!,
        pingMs: Math.round(s.latency),
        jitterMs: typeof s.jitter === "number" ? Math.round(s.jitter * 10) / 10 : null,
      })
    }

    signal.addEventListener("abort", onAbort, { once: true })

    engine.play()
  })
}
