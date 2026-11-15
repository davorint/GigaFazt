"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { burstEnabled, planDefaults, simulate, type QueueParams, type SimResult, type TransferStats } from "@/lib/mikrotik/burst"
import { fmtData, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { rosRate, rosTime } from "@/lib/mikrotik/routeros"
import { PRESETS, viewParams, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { MultiChart, type ChartSeries } from "./MultiChart"
import { NEUTRAL_SERIES, SERIES_COLORS } from "./ticks"

type Run = { key: string; label: string; color: string; dash?: string; params: QueueParams; result: SimResult }

/** Value of a run at time t (runs can step at different burst-time ÷ 16). */
function at(result: SimResult, t: number): number {
  const i = Math.min(result.samples.length - 1, Math.floor(t / result.stats.stepS + 1e-9))
  return result.samples[i]?.rate ?? 0
}

export function ComparePanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik")
  const current = viewParams(state)
  const { pattern, durationS, lineCapMbps } = state
  const custom = state.preset === "custom"

  const runs = useMemo<Run[]>(() => {
    const list: Omit<Run, "result">[] = PRESETS.map((p, i) => ({
      key: p.id,
      label: speedLabel(p.downMbps),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      params: planDefaults(p.downMbps),
    }))
    if (custom) list.push({ key: "current", label: t("compare.current"), color: NEUTRAL_SERIES, dash: "5 3", params: current })
    return list.map((r) => ({ ...r, result: simulate(r.params, pattern, durationS, { lineCapMbps }) }))
  }, [custom, current, pattern, durationS, lineCapMbps, t])

  const dt = Math.min(...runs.map((r) => r.result.stats.stepS))
  const steps = Math.max(1, Math.ceil(durationS / dt - 1e-9))
  const series = useMemo<ChartSeries[]>(
    () =>
      runs.map((r) => ({
        key: r.key,
        label: r.label,
        color: r.color,
        dash: r.dash,
        values: Array.from({ length: steps }, (_, i) => at(r.result, i * dt)),
      })),
    [runs, steps, dt]
  )

  const direction = state.symmetric ? "" : ` · ${t(`params.${state.view}`)}`
  const kind = t(`sim.kinds.${pattern.kind}`)
  const transferCol = runs[0]?.result.stats.transfer?.kind ?? null
  const result = (tr: TransferStats | null) => {
    if (!tr) return null
    if (tr.kind === "download") return tr.finishS === null ? t("compare.never") : fmtSec(tr.finishS)
    if (tr.kind === "video") return tr.startupS === null ? t("compare.never") : `${fmtSec(tr.startupS)} · ${fmtSec(tr.stallS)}`
    return tr.meanS === null ? "—" : fmtSec(tr.meanS)
  }

  const summary = t("compare.summary", {
    lines: runs
      .map((r) => t("compare.summaryLine", { plan: r.label, burst: fmtSec(r.result.stats.firstBurstS), total: fmtData(r.result.stats.totalMb) }))
      .join(" "),
  })

  return (
    <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-300">{t("compare.traffic", { kind, duration: fmtSec(durationS), direction })}</p>
        <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">
          {t("sim.tag")}
        </span>
      </div>

      <MultiChart
        mode="line"
        label={t("compare.label")}
        summary={summary}
        axisY={t("chart.axisY")}
        axisX={t("chart.axisX")}
        dt={dt}
        durationS={steps * dt}
        series={series}
        timeLabel={(value) => t("chart.tip.t", { value })}
        tableLabel={t("compare.table")}
        tableCaption={t("compare.tableCaption", { step: fmtSec(dt) })}
        timeCol={t("chart.col.t")}
      />

      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("compare.resultsCaption")}>
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">{t("compare.resultsCaption")}</caption>
          <thead className="text-xs text-zinc-400">
            <tr className="border-b border-white/10">
              {(["plan", "maxLimit", "burstLimit", "burstThreshold", "burstTime", "firstBurst", "total", "activeAvg"] as const).map((c) => (
                <th key={c} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                  {t(`compare.cols.${c}`)}
                </th>
              ))}
              {transferCol && (
                <th scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                  {t(`compare.cols.${transferCol}`)}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="font-mono text-xs tabular-nums">
            {runs.map((r) => {
              const on = burstEnabled(r.params)
              const st = r.result.stats
              return (
                <tr key={r.key} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2.5 text-left font-sans text-sm font-normal whitespace-nowrap text-foreground">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="w-4 border-t-2" style={{ borderColor: r.color, borderStyle: r.dash ? "dashed" : "solid" }} />
                      {r.label}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">{rosRate(r.params.maxLimit)}</td>
                  <td className="px-3 py-2.5">{on ? rosRate(r.params.burstLimit) : t("compare.noBurst")}</td>
                  <td className="px-3 py-2.5">{on ? rosRate(r.params.burstThreshold) : "—"}</td>
                  <td className="px-3 py-2.5">{on ? rosTime(r.params.burstTime) : "—"}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtSec(st.firstBurstS)}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtData(st.totalMb)}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtRate(st.activeAvgMbps)}</td>
                  {transferCol && <td className="px-3 py-2.5 text-zinc-100">{result(st.transfer)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
