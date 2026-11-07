"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Gauge, Play, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { runSpeedTest, type SpeedProgress } from "@/lib/speedtest"
import { selection, useSelection } from "@/lib/selection"
import { DEMO_LINE } from "@/lib/telemetry/mock"
import { track } from "@/lib/analytics"
import { SpeedComparison } from "./SpeedComparison"

type Status = "idle" | "running" | "error" | "cancelled"

/**
 * Real speed test of the visitor's current connection (SPEC §4). The engine is
 * imported only on "Iniciar prueba"; the test is cancellable and never blocks
 * the page. Failure or "Ver un ejemplo" shows a DEMO DATA comparison instead.
 */
export function SpeedTest() {
  const t = useTranslations("fiber.speedtest")
  const real = useSelection((s) => s.speedTest)
  const demo = useSelection((s) => s.speedDemo)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState<SpeedProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus("running")
    setProgress({ phase: "latency", progress: 0 })
    try {
      const r = await runSpeedTest(setProgress, ctrl.signal)
      selection.setSpeedTest({ downMbps: r.downMbps, upMbps: r.upMbps, pingMs: r.pingMs })
      track("speedtest_completed", { down: r.downMbps, up: r.upMbps, ping: r.pingMs })
      setStatus("idle")
    } catch (e) {
      if (ctrl.signal.aborted) setStatus("cancelled")
      else {
        console.warn("[speedtest]", e)
        setStatus("error")
      }
    }
  }

  const cancel = () => abortRef.current?.abort()
  const showDemo = () => selection.setSpeedDemo({ ...DEMO_LINE })

  const line = real ?? demo
  const pct = Math.round((progress?.progress ?? 0) * 100)

  return (
    <div className="hud-brackets rounded-xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Gauge className="mt-1 size-5 shrink-0 text-fiber" aria-hidden />
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("desc")}</p>
        </div>
      </div>

      {status === "running" && progress ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between font-mono text-xs text-muted-foreground">
            <span>{t(`phase.${progress.phase}`)}</span>
            <span>{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-fiber shadow-[0_0_8px_var(--color-fiber)] transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Live numbers: ambient while running, so deliberately not aria-live. */}
          <dl className="mt-5 grid grid-cols-3 gap-3 font-mono">
            {(
              [
                ["down", progress.downMbps, "Mbps"],
                ["up", progress.upMbps, "Mbps"],
                ["ping", progress.pingMs, "ms"],
              ] as const
            ).map(([k, v, unit]) => (
              <div key={k} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t(k)}</dt>
                <dd className="mt-1 text-xl text-foreground">
                  {v ?? "—"} <span className="text-xs text-muted-foreground">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          <Button variant="outline" className="mt-5" onClick={cancel}>
            <X />
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 font-mono text-xs uppercase tracking-wider shadow-[0_0_24px_-6px_var(--color-fiber)]"
            onClick={start}
          >
            {real ? <RotateCcw /> : <Play />}
            {real ? t("retry") : t("start")}
          </Button>
          {!real && (
            <Button variant="ghost" size="lg" className="h-11" onClick={showDemo}>
              {t("demo")}
            </Button>
          )}
        </div>
      )}

      {/* Persistent live region: user-triggered outcomes only (error, cancel, result, demo). */}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {status === "error"
          ? t("failed")
          : status === "cancelled"
            ? t("cancelled")
            : null}
        <span className="sr-only">
          {status === "running"
            ? ""
            : real
              ? t("announce", { down: real.downMbps, up: real.upMbps, ping: real.pingMs })
              : demo
                ? `${t("demoNote")} ${t("announce", { down: demo.downMbps, up: demo.upMbps, ping: demo.pingMs })}`
                : ""}
        </span>
      </p>

      {line && status !== "running" && (
        <SpeedComparison line={line} demo={!real} />
      )}
    </div>
  )
}
