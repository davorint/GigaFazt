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
import LatencyPhysics from "./LatencyPhysics"

const WINDOW_MS = 60_000
const BACKFILL = 90 // 60 s at the mock's 1.5 Hz

/**
 * Live network panel (SPEC §4): huge live ↓/↑ figures, a full-width mirrored
 * column graph, then latency gauge and jitter/loss in one row, all driven by a TelemetrySource and tagged SIMULACIÓN
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
        // Refill the window on every (re)subscribe so time spent offscreen or
        // in a background tab doesn't leave a hole in the graph.
        if (source.history) setPoints(source.history(BACKFILL))
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
    <div ref={ref} className="relative overflow-hidden rounded-2xl surface p-5 sm:p-8">
      {/* Ambient light: cyan above the axis, violet below, like the graph. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 38%, rgb(6 182 212 / 0.09), transparent 70%), radial-gradient(50% 30% at 50% 70%, rgb(167 139 250 / 0.06), transparent 70%)",
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{t("title")}</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("desc")}</p>
          </div>
          <SimTag />
        </div>

        {/* Live figures, huge: the panel's headline. */}
        <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-3">
          <p className="w-full font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {t("throughput")}
          </p>
          {(
            [
              ["down", "↓", last?.downGbps, "text-fiber [text-shadow:0_0_28px_rgb(34_211_238/0.55)]"],
              ["up", "↑", last?.upGbps, "text-violet-300 [text-shadow:0_0_28px_rgb(167_139_250/0.55)]"],
            ] as const
          ).map(([k, arrow, v, cls]) => (
            <p key={k} className="font-mono">
              <span className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {arrow} {t(k)}
              </span>
              <span className={`text-5xl font-semibold tracking-[-0.04em] tabular-nums sm:text-6xl ${cls}`}>{f(v)}</span>
              <span className="ml-1.5 text-base text-muted-foreground">Gbps</span>
            </p>
          ))}
        </div>

        <div className="mt-6">
          <ThroughputGraph
            points={points}
            windowMs={WINDOW_MS}
            label={t("graphAlt", { down: f(last?.downGbps), up: f(last?.upGbps) })}
            axis={{ down: t("down"), up: t("up"), window: `${WINDOW_MS / 1000} s` }}
          />
          <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
            {t("window")}
            {reduced && ` · ${t("static")}`}
          </p>
        </div>

        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] md:grid-cols-3">
          <div className="surface-cell flex items-center gap-4 p-4">
            <div className="w-36 shrink-0">
              <LatencyGauge
                p50={last?.p50Ms ?? 0}
                p99={last?.p99Ms ?? 0}
                label={t("gaugeAlt", { p50: f(last?.p50Ms, 2), p99: f(last?.p99Ms, 2) })}
                unitLabel={t("p50Unit")}
              />
            </div>
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("latency")}</p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {t("p99")} <span className="text-warn">{f(last?.p99Ms, 2)} ms</span>
              </p>
            </div>
          </div>
          {(
            [
              ["jitter", last?.jitterMs, "ms", recent.map((p) => p.jitterMs)],
              ["loss", last?.lossPct, "%", recent.map((p) => p.lossPct)],
            ] as const
          ).map(([k, v, unit, series]) => (
            <div key={k} className="surface-cell flex flex-col justify-between gap-2 p-4">
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t(k)}</p>
              <p className="font-mono text-3xl font-semibold tracking-[-0.03em] text-foreground tabular-nums">
                {f(v, k === "loss" ? 3 : 2)} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
              </p>
              <Sparkline values={[...series]} />
            </div>
          ))}
        </div>
      </div>

      {/* Latency physics closes the panel: one "network" statement, not two cards. */}
      <div className="mt-10 border-t border-white/[0.06] pt-8">
        <LatencyPhysics bare />
      </div>
    </div>
  )
}
