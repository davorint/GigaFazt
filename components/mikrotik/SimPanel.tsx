"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { burstEnabled, isTransfer, KINDS, simulate, type Pattern, type SimStats } from "@/lib/mikrotik/burst"
import { fmtData, fmtNum, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { rosRate, rosTime } from "@/lib/mikrotik/routeros"
import { MAX_DURATION_S, PRESETS, viewParams, type Direction, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { BurstChart } from "./BurstChart"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Props = {
  state: LabState
  /** Same plan presets as Parámetros: picking one loads its queue values. */
  onPreset: (id: string) => void
  onPattern: (patch: Partial<Pattern>) => void
  onDuration: (s: number) => void
  onView: (d: Direction) => void
}

type Tile = { k: string; label: string; v: string; sub: string }

/** The figure a transfer pattern is about: file done, video start, page time. */
function transferTile(t: ReturnType<typeof useTranslations<"mikrotik">>, stats: SimStats, base: SimStats): Tile | null {
  const tr = stats.transfer
  if (!tr) return null
  if (tr.kind === "download") {
    if (tr.finishS === null) return { k: "finish", label: t("sim.stats.finish"), v: t("sim.stats.finishNever"), sub: t("sim.stats.finishNeverSub") }
    const b = base.transfer?.finishS ?? null
    const sub =
      b === null
        ? t("sim.stats.finishSubNoBase")
        : b - tr.finishS > 1e-6
          ? t("sim.stats.finishSub", { base: fmtSec(b), saved: fmtSec(b - tr.finishS) })
          : t("sim.stats.finishSubSame")
    return { k: "finish", label: t("sim.stats.finish"), v: fmtSec(tr.finishS), sub }
  }
  if (tr.kind === "video") {
    return {
      k: "startup",
      label: t("sim.stats.startup"),
      v: tr.startupS === null ? t("sim.stats.startupNever") : fmtSec(tr.startupS),
      sub: t("sim.stats.startupSub", { stall: fmtSec(tr.stallS) }),
    }
  }
  return {
    k: "pageLoad",
    label: t("sim.stats.pageLoad"),
    v: tr.meanS === null ? "—" : fmtSec(tr.meanS),
    sub: t("sim.stats.pageLoadSub", { count: tr.done }),
  }
}

export function SimPanel({ state, onPreset, onPattern, onDuration, onView }: Props) {
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

  const transfer = isTransfer(pattern.kind)
  const special = transferTile(t, stats, base.stats)
  const tiles: Tile[] = [
    { k: "activeAvg", label: t("sim.stats.activeAvg"), v: fmtRate(stats.activeAvgMbps), sub: t("sim.stats.activeAvgSub") },
    {
      k: "total",
      label: t("sim.stats.total"),
      v: fmtData(stats.totalMb),
      sub:
        extraMb > 1e-6
          ? t("sim.stats.totalSub", { extra: fmtData(extraMb), pct: fmtPct(base.stats.totalMb > 0 ? extraMb / base.stats.totalMb : 0) })
          : t("sim.stats.totalSubNone"),
    },
    { k: "burst", label: t("sim.stats.burst"), v: fmtSec(stats.burstS), sub: t("sim.stats.burstSub", { count: stats.burstCount }) },
    special ?? { k: "peak", label: t("sim.stats.peak"), v: fmtRate(stats.peakMbps), sub: t("sim.stats.peakSub") },
  ]
  const hint = t(`sim.kindsHint.${pattern.kind}`, { size: `${fmtNum(pattern.pageMB, 2)} ${t("sim.unitMB")}` })

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("sim.plan")}</p>
          <Choice
            label={t("sim.plan")}
            value={state.preset}
            onChange={onPreset}
            options={[
              ...PRESETS.map((pr) => ({ value: pr.id, label: speedLabel(pr.downMbps) })),
              { value: "custom", label: t("params.custom") },
            ]}
          />
          <p className="max-w-2xl text-xs text-zinc-400">
            {burstEnabled(p)
              ? t("sim.queue", { max: rosRate(p.maxLimit), burst: rosRate(p.burstLimit), threshold: rosRate(p.burstThreshold), time: rosTime(p.burstTime) })
              : t("sim.queueNoBurst", { max: rosRate(p.maxLimit) })}{" "}
            <a href="#parametros" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {t("sim.edit")}
            </a>
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("sim.pattern")}</p>
            <Choice
              label={t("sim.pattern")}
              value={pattern.kind}
              onChange={(kind) => onPattern({ kind })}
              options={KINDS.map((k) => ({ value: k, label: t(`sim.kinds.${k}`) }))}
            />
            <p className="max-w-2xl text-xs text-zinc-400">{hint}</p>
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

        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!transfer && (
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
          )}
          {pattern.kind === "download" && (
            <NumberField label={t("sim.fileMB")} unit={t("sim.unitMB")} value={pattern.fileMB} min={0.001} max={1e7} onChange={(v) => v !== null && onPattern({ fileMB: v })} />
          )}
          {pattern.kind === "video" && (
            <NumberField
              label={t("sim.videoMbps")}
              unit={t("params.unitMbps")}
              value={pattern.videoMbps}
              min={0.001}
              max={1e4}
              hint={t("sim.videoHint")}
              onChange={(v) => v !== null && onPattern({ videoMbps: v })}
            />
          )}
          {pattern.kind === "web" && (
            <NumberField label={t("sim.pageMB")} unit={t("sim.unitMB")} value={pattern.pageMB} min={0.001} max={1e4} onChange={(v) => v !== null && onPattern({ pageMB: v })} />
          )}
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
            <dt className="text-xs text-zinc-400">{tile.label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{tile.v}</dd>
            <dd className="mt-1 text-xs leading-snug text-zinc-500">{tile.sub}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
