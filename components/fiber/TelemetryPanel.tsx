"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { SimTag } from "@/components/hud/SimTag"
import { mockTelemetry } from "@/lib/telemetry/mock"
import type { TelemetrySnapshot, TelemetrySource } from "@/lib/telemetry/types"
import { ThroughputGraph } from "./ThroughputGraph"
import { LatencyGauge } from "./LatencyGauge"
import { Sparkline } from "./Sparkline"
import { useReducedMotion } from "@/lib/motion"

const WINDOW_MS = 60_000
const BACKFILL = 90 // 60 s at the mock's 1.5 Hz

/**
 * Live network panel (SPEC §4): mirrored throughput graph, latency gauge and
 * jitter/loss tiles, all driven by a TelemetrySource and tagged SIMULACIÓN
 * (hard rule #2). Pauses offscreen and in background tabs. Under reduced
 * motion it renders one static 60 s frame and never updates. Ambient: no
 * aria-live. Lazy-loaded by LazyTelemetryPanel.
 */
export default function TelemetryPanel({ source = mockTelemetry }: { source?: TelemetrySource }) {
  const t = useTranslations("fiber.telemetry")
  const ref = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<TelemetrySnapshot[]>(() => source.history?.(BACKFILL) ?? [])
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    let unsubscribe: (() => void) | null = null
    let onScreen = false

    const sync = () => {
      const want = onScreen && document.visibilityState === "visible"
      if (want && !unsubscribe) {
        unsubscribe = source.subscribe((s) =>
          setPoints((prev) => [...prev.filter((p) => p.t >= s.t - WINDOW_MS), s])
        )
      } else if (!want && unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }

    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    })
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
      unsubscribe?.()
    }
  }, [reduced, source])

  const last = points.at(-1)
  const recent = points.slice(-30)
  const f = (n: number | undefined, d = 1) => (n === undefined ? "—" : n.toFixed(d))

  return (
    <div ref={ref} className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <SimTag />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-2 flex items-baseline justify-between font-mono text-xs text-muted-foreground">
            <span className="uppercase tracking-wider">{t("throughput")}</span>
            <span>
              <span className="text-fiber">↓ {f(last?.downGbps)}</span> /{" "}
              <span className="text-fiber/80">↑ {f(last?.upGbps)}</span> Gbps
            </span>
          </div>
          <ThroughputGraph
            points={points}
            windowMs={WINDOW_MS}
            label={t("graphAlt", { down: f(last?.downGbps), up: f(last?.upGbps) })}
            axis={{ down: t("down"), up: t("up"), window: `${WINDOW_MS / 1000} s` }}
          />
          <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
            {t("window")}
            {reduced && ` · ${t("static")}`}
          </p>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-border p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("latency")}</p>
            <LatencyGauge
              p50={last?.p50Ms ?? 0}
              p99={last?.p99Ms ?? 0}
              label={t("gaugeAlt", { p50: f(last?.p50Ms, 2), p99: f(last?.p99Ms, 2) })}
              unitLabel={t("p50Unit")}
            />
            <p className="text-center font-mono text-xs text-muted-foreground">
              {t("p99")} <span className="text-warn">{f(last?.p99Ms, 2)} ms</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["jitter", last?.jitterMs, "ms", recent.map((p) => p.jitterMs)],
                ["loss", last?.lossPct, "%", recent.map((p) => p.lossPct)],
              ] as const
            ).map(([k, v, unit, series]) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t(k)}</p>
                <p className="mt-1 font-mono text-lg text-foreground">
                  {f(v, k === "loss" ? 3 : 2)} <span className="text-xs text-muted-foreground">{unit}</span>
                </p>
                <Sparkline values={[...series]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
