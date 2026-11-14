"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { solve } from "@/lib/mikrotik/burst"
import { rosRate } from "@/lib/mikrotik/routeros"
import { fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { viewParams, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Mode = "burstTime" | "burstThreshold"

export function SolverPanel({
  state,
  onApply,
}: {
  state: LabState
  onApply: (v: { burstThreshold: number; burstTime: number }) => void
}) {
  const t = useTranslations("mikrotik")
  const p = viewParams(state)
  const [targetS, setTargetS] = useState(8)
  const [mode, setMode] = useState<Mode>("burstThreshold")
  const [threshold, setThreshold] = useState(p.burstThreshold || Math.round(p.maxLimit * 0.75))
  const [time, setTime] = useState(p.burstTime || 16)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!applied) return
    const id = window.setTimeout(() => setApplied(false), 1800)
    return () => window.clearTimeout(id)
  }, [applied])

  const r =
    mode === "burstTime"
      ? solve({ maxLimit: p.maxLimit, burstLimit: p.burstLimit, targetS, solveFor: "burstTime", burstThreshold: threshold })
      : solve({ maxLimit: p.maxLimit, burstLimit: p.burstLimit, targetS, solveFor: "burstThreshold", burstTime: time })

  const dir = state.symmetric ? "" : ` · ${t(`params.${state.view}`)}`

  return (
    <div className="surface grid gap-7 rounded-2xl p-5 sm:p-7 lg:grid-cols-[1fr_1fr] lg:gap-10 [&>*]:min-w-0">
      <div className="grid content-start gap-5">
        <p className="text-sm text-zinc-300">
          {t("solver.using", { max: fmtRate(p.maxLimit), burst: fmtRate(p.burstLimit), direction: dir })}
        </p>
        <NumberField
          label={t("solver.target")}
          unit={t("params.unitS")}
          value={targetS}
          min={0.1}
          max={3600}
          onChange={(v) => v !== null && setTargetS(v)}
          className="max-w-xs"
        />
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("solver.mode")}</p>
          <Choice
            label={t("solver.mode")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "burstThreshold", label: t("solver.modes.burstThreshold") },
              { value: "burstTime", label: t("solver.modes.burstTime") },
            ]}
            className="sm:w-full"
          />
        </div>
        {mode === "burstTime" ? (
          <NumberField
            label={t("solver.fixedThreshold")}
            unit={t("params.unitMbps")}
            value={threshold}
            min={0.001}
            onChange={(v) => v !== null && setThreshold(v)}
            className="max-w-xs"
          />
        ) : (
          <NumberField
            label={t("solver.fixedTime")}
            unit={t("params.unitS")}
            value={time}
            min={1}
            max={3600}
            integer
            onChange={(v) => v !== null && setTime(v)}
            className="max-w-xs"
          />
        )}
        <p className="font-mono text-xs text-zinc-500">{t("solver.formula")}</p>
      </div>

      <div className="grid content-start gap-4 rounded-xl border border-white/10 bg-black/20 p-5" aria-live="polite">
        <h3 className="text-xs text-zinc-400">{t("solver.result")}</h3>
        {r ? (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="font-mono text-xs text-zinc-400">burst-threshold</dt>
                <dd className="mt-1 font-mono text-3xl font-light tabular-nums">{rosRate(r.burstThreshold)}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-zinc-400">burst-time</dt>
                <dd className="mt-1 font-mono text-3xl font-light tabular-nums">{r.burstTime}s</dd>
              </div>
            </dl>
            <p className="text-sm text-zinc-300">{t("solver.real", { value: fmtSec(r.durationS) })}</p>
            {r.burstThreshold > p.maxLimit && <p className="text-sm text-amber-300">{t("solver.warnAboveMax")}</p>}
            <div>
              <Button
                type="button"
                onClick={() => {
                  onApply({ burstThreshold: r.burstThreshold, burstTime: r.burstTime })
                  setApplied(true)
                }}
              >
                {applied && <Check aria-hidden />}
                {applied ? t("solver.applied") : t("solver.apply")}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-300">{t("solver.impossible")}</p>
        )}
      </div>
    </div>
  )
}
