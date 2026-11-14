"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { simulate, type Pattern, type PatternKind } from "@/lib/mikrotik/burst"
import { fmtData, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { MAX_DURATION_S, viewParams, type Direction, type LabState } from "@/lib/mikrotik/state"
import { BurstChart } from "./BurstChart"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Props = {
  state: LabState
  onPattern: (patch: Partial<Pattern>) => void
  onDuration: (s: number) => void
  onView: (d: Direction) => void
}

const KINDS: PatternKind[] = ["sustained", "intermittent", "speedtest"]

export function SimPanel({ state, onPattern, onDuration, onView }: Props) {
  const t = useTranslations("mikrotik")
  const p = viewParams(state)
  const { pattern } = state
  const cap = state.lineCapMbps
  const duration = state.durationS

  const result = useMemo(() => simulate(p, pattern, duration, { lineCapMbps: cap }), [p, pattern, duration, cap])
  // Same traffic without burst: what the burst adds.
  const base = useMemo(() => simulate(p, pattern, duration, { lineCapMbps: cap, noBurst: true }), [p, pattern, duration, cap])
  const { stats } = result
  const extraMb = stats.totalMb - base.stats.totalMb
  const direction = state.symmetric ? `${t("params.down")} / ${t("params.up")}` : t(`params.${state.view}`)

  const tiles = [
    { k: "activeAvg", v: fmtRate(stats.activeAvgMbps), sub: t("sim.stats.activeAvgSub") },
    {
      k: "total",
      v: fmtData(stats.totalMb),
      sub:
        extraMb > 1e-6
          ? t("sim.stats.totalSub", { extra: fmtData(extraMb), pct: fmtPct(base.stats.totalMb > 0 ? extraMb / base.stats.totalMb : 0) })
          : t("sim.stats.totalSubNone"),
    },
    { k: "burst", v: fmtSec(stats.burstS), sub: t("sim.stats.burstSub", { count: stats.burstCount }) },
    { k: "peak", v: fmtRate(stats.peakMbps), sub: t("sim.stats.peakSub") },
  ] as const

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("sim.pattern")}</p>
            <Choice
              label={t("sim.pattern")}
              value={pattern.kind}
              onChange={(kind) => onPattern({ kind })}
              options={KINDS.map((k) => ({ value: k, label: t(`sim.kinds.${k}`) }))}
            />
            <p className="text-xs text-zinc-400">{t(`sim.kindsHint.${pattern.kind}`)}</p>
          </div>
          {!state.symmetric && (
            <Choice
              label={t("figures.direction")}
              value={state.view}
              onChange={onView}
              options={[
                { value: "down", label: t("params.down") },
                { value: "up", label: t("params.up") },
              ]}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid content-start gap-3 sm:col-span-2 lg:col-span-1">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <Switch
                checked={pattern.demandMbps === null}
                onCheckedChange={(on) => onPattern({ demandMbps: on ? null : Math.round(p.burstLimit || p.maxLimit) })}
              />
              {t("sim.saturate")}
            </label>
            {pattern.demandMbps !== null && (
              <NumberField
                label={t("sim.demand")}
                unit={t("params.unitMbps")}
                value={pattern.demandMbps}
                min={0.001}
                onChange={(v) => v !== null && onPattern({ demandMbps: v })}
              />
            )}
          </div>
          <NumberField
            label={t("sim.start")}
            unit={t("params.unitS")}
            value={pattern.startS}
            max={3600}
            onChange={(v) => v !== null && onPattern({ startS: v })}
          />
          {pattern.kind === "intermittent" && (
            <>
              <NumberField label={t("sim.on")} unit={t("params.unitS")} value={pattern.onS} min={0.1} max={3600} onChange={(v) => v !== null && onPattern({ onS: v })} />
              <NumberField label={t("sim.off")} unit={t("params.unitS")} value={pattern.offS} max={3600} onChange={(v) => v !== null && onPattern({ offS: v })} />
            </>
          )}
          {pattern.kind === "speedtest" && (
            <NumberField label={t("sim.test")} unit={t("params.unitS")} value={pattern.testS} min={0.1} max={3600} onChange={(v) => v !== null && onPattern({ testS: v })} />
          )}
          <NumberField
            label={t("sim.duration")}
            unit={t("params.unitS")}
            value={state.durationS}
            min={1}
            max={MAX_DURATION_S}
            onChange={(v) => v !== null && onDuration(v)}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-300">{direction}</p>
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">
            {t("sim.tag")}
          </span>
        </div>
        <BurstChart result={result} params={p} pattern={pattern} lineCapMbps={state.lineCapMbps} direction={direction} />
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.k} className="surface-cell p-4">
            <dt className="text-xs text-zinc-400">{t(`sim.stats.${tile.k}`)}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{tile.v}</dd>
            <dd className="mt-1 text-xs leading-snug text-zinc-500">{tile.sub}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
