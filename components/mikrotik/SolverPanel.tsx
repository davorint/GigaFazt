"use client"

import { useEffect, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { burstEnabled, longestSingleBurst, solve, type SolveResult } from "@/lib/mikrotik/burst"
import { rosRate } from "@/lib/mikrotik/routeros"
import { fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { viewParams, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Mode = "burstTime" | "burstThreshold"
type Applied = { burstThreshold: number; burstTime: number }

export function SolverPanel({ state, onApply }: { state: LabState; onApply: (v: Applied) => void }) {
  const t = useTranslations("mikrotik")
  const p = viewParams(state)
  const [targetS, setTargetS] = useState(8)
  // Fixing the threshold keeps it where it is (under max-limit), so the default always has an answer.
  const [mode, setMode] = useState<Mode>("burstTime")
  // null = follow the queue above until the user types a value.
  const [thresholdEdit, setThreshold] = useState<number | null>(null)
  const [timeEdit, setTime] = useState<number | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const queueThreshold = burstEnabled(p) ? p.burstThreshold : Math.round(p.maxLimit * 0.75)
  const threshold = thresholdEdit ?? queueThreshold
  const time = timeEdit ?? (burstEnabled(p) ? p.burstTime : 16)
  const edited = thresholdEdit !== null || timeEdit !== null

  useEffect(() => {
    if (!applied) return
    const id = window.setTimeout(() => setApplied(null), 1800)
    return () => window.clearTimeout(id)
  }, [applied])

  const r =
    mode === "burstTime"
      ? solve({ maxLimit: p.maxLimit, burstLimit: p.burstLimit, targetS, solveFor: "burstTime", burstThreshold: threshold })
      : solve({ maxLimit: p.maxLimit, burstLimit: p.burstLimit, targetS, solveFor: "burstThreshold", burstTime: time })
  const repeats = r !== null && r.burstThreshold > p.maxLimit + 1e-9
  // With the threshold at most max-limit, the longest burst this burst-time can give.
  const longest = longestSingleBurst(p.maxLimit, p.burstLimit, time)
  // A threshold that stays under max-limit (75 % of it) and the burst-time that gives the target with it.
  const safeThreshold = Math.min(queueThreshold, p.maxLimit)
  const alternative = repeats ? solve({ maxLimit: p.maxLimit, burstLimit: p.burstLimit, targetS, solveFor: "burstTime", burstThreshold: safeThreshold }) : null

  const dir = state.symmetric ? "" : ` · ${t(`params.${state.view}`)}`
  const apply = (v: SolveResult, key: string) => {
    onApply({ burstThreshold: v.burstThreshold, burstTime: v.burstTime })
    setApplied(key)
  }

  return (
    <div className="surface grid gap-7 rounded-2xl p-5 sm:p-7 lg:grid-cols-[1fr_1fr] lg:gap-10 [&>*]:min-w-0">
      <div className="grid content-start gap-5">
        <p className="text-sm text-zinc-300">{t("solver.using", { max: fmtRate(p.maxLimit), burst: fmtRate(p.burstLimit), direction: dir })}</p>
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
              { value: "burstTime", label: t("solver.modes.burstTime") },
              { value: "burstThreshold", label: t("solver.modes.burstThreshold") },
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
            hint={t("solver.fixedThresholdHint", { max: rosRate(p.maxLimit) })}
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
            hint={longest > 0 ? t("solver.longest", { value: fmtSec(longest), time: `${time}` }) : undefined}
            className="max-w-xs"
          />
        )}
        {edited && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setThreshold(null)
                setTime(null)
              }}
            >
              <RotateCcw aria-hidden />
              {t("solver.follow")}
            </Button>
          </div>
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
            {repeats && <p className="text-sm text-amber-300">{t("solver.warnAboveMax", { longest: fmtSec(longest), time: `${time}` })}</p>}
            <div>
              <Button type="button" variant={repeats ? "outline" : "default"} onClick={() => apply(r, "main")}>
                {applied === "main" && <Check aria-hidden />}
                {applied === "main" ? t("solver.applied") : t("solver.apply")}
              </Button>
            </div>
            {alternative && (
              <div className="grid gap-3 border-t border-white/10 pt-4">
                <p className="text-sm text-zinc-200">
                  {t("solver.alternative", {
                    threshold: rosRate(alternative.burstThreshold),
                    time: `${alternative.burstTime}`,
                    value: fmtSec(alternative.durationS),
                  })}
                </p>
                <div>
                  <Button type="button" onClick={() => apply(alternative, "alt")}>
                    {applied === "alt" && <Check aria-hidden />}
                    {applied === "alt" ? t("solver.applied") : t("solver.applyAlternative")}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-amber-300">{t("solver.impossible")}</p>
        )}
      </div>
    </div>
  )
}
