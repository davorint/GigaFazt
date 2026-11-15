"use client"

import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import type { QueueParams } from "@/lib/mikrotik/burst"
import { rosRate } from "@/lib/mikrotik/routeros"
import { fmtPct } from "@/lib/mikrotik/format"
import { PRESETS, type Direction, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Props = {
  state: LabState
  onPreset: (id: string) => void
  onSymmetric: (on: boolean) => void
  onQueue: (dir: Direction, patch: Partial<QueueParams>) => void
  onLineCap: (v: number | null) => void
  onPlan: (v: number | null) => void
}

export function ParamsPanel({ state, onPreset, onSymmetric, onQueue, onLineCap, onPlan }: Props) {
  const t = useTranslations("mikrotik.params")
  const dirs: Direction[] = state.symmetric ? ["down"] : ["down", "up"]
  const ros = (v: number) => t("ros", { value: rosRate(v) })

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-2">
        <p className="font-mono text-xs text-zinc-300">
          {t("preset")}
        </p>
        <Choice
          label={t("preset")}
          value={state.preset}
          onChange={onPreset}
          options={[
            ...PRESETS.map((p) => ({ value: p.id, label: speedLabel(p.downMbps) })),
            { value: "custom", label: t("custom") },
          ]}
        />
      </div>

      <NumberField
        label={t("plan")}
        unit={t("unitMbps")}
        value={state.planMbps}
        optional
        min={0.001}
        onChange={onPlan}
        hint={t("planHint")}
        className="max-w-sm"
      />

      <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-200">
        <Switch checked={state.symmetric} onCheckedChange={onSymmetric} />
        {t("symmetric")}
      </label>

      <div className={state.symmetric ? "grid" : "grid gap-8 xl:grid-cols-2"}>
        {dirs.map((dir) => {
          const q = state[dir]
          return (
            <fieldset key={dir} className="grid min-w-0 gap-4">
              {!state.symmetric && (
                <legend className="mb-3 text-sm font-medium text-foreground">{t(dir)}</legend>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t("maxLimit")}
                  unit={t("unitMbps")}
                  value={q.maxLimit}
                  min={0.001}
                  onChange={(v) => v !== null && onQueue(dir, { maxLimit: v })}
                  hint={`${t("maxLimitHint")} ${ros(q.maxLimit)}`}
                />
                <NumberField
                  label={t("burstLimit")}
                  unit={t("unitMbps")}
                  value={q.burstLimit}
                  onChange={(v) => v !== null && onQueue(dir, { burstLimit: v })}
                  hint={`${t("burstLimitHint")} ${ros(q.burstLimit)}`}
                />
                <NumberField
                  label={t("burstThreshold")}
                  unit={t("unitMbps")}
                  value={q.burstThreshold}
                  onChange={(v) => v !== null && onQueue(dir, { burstThreshold: v })}
                  hint={`${t("burstThresholdHint", { pct: fmtPct(q.burstThreshold / q.maxLimit) })} ${ros(q.burstThreshold)}`}
                />
                <NumberField
                  label={t("burstTime")}
                  unit={t("unitS")}
                  value={q.burstTime}
                  integer
                  max={3600}
                  onChange={(v) => v !== null && onQueue(dir, { burstTime: v })}
                  hint={t("burstTimeHint")}
                />
                <NumberField
                  label={t("limitAt")}
                  unit={t("unitMbps")}
                  value={q.limitAt}
                  onChange={(v) => v !== null && onQueue(dir, { limitAt: v })}
                  hint={t("limitAtHint")}
                  className="sm:col-span-2"
                />
              </div>
            </fieldset>
          )
        })}
      </div>

      <div className="border-t border-white/10 pt-6">
        <NumberField
          label={t("lineCap")}
          unit={t("unitMbps")}
          value={state.lineCapMbps}
          optional
          min={0.001}
          onChange={onLineCap}
          hint={t("lineCapHint")}
          className="max-w-sm"
        />
      </div>
    </div>
  )
}
