"use client"

import { AlertTriangle, CircleCheck, CircleX, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { check, figures, type Issue } from "@/lib/mikrotik/burst"
import { fmtData, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { viewParams, type Direction, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"

const ICON = { error: CircleX, warn: AlertTriangle, info: Info } as const
const TONE = { error: "text-red-300", warn: "text-amber-300", info: "text-zinc-400" } as const

export function FiguresPanel({ state, onView }: { state: LabState; onView: (d: Direction) => void }) {
  const t = useTranslations("mikrotik")
  const p = viewParams(state)
  const opts = { demandMbps: state.pattern.demandMbps, lineCapMbps: state.lineCapMbps }
  const f = figures(p, opts)

  const dirs: Direction[] = state.symmetric ? ["down"] : ["down", "up"]
  const issues: { dir: Direction; issue: Issue }[] = dirs.flatMap((dir) =>
    check(state[dir], opts).map((issue) => ({ dir, issue }))
  )

  const durationValue =
    f.durationS === Number.POSITIVE_INFINITY ? t("figures.durationNever") : f.durationS > 0 ? fmtSec(f.durationS) : t("figures.durationNone")
  const durationSub =
    f.durationS === Number.POSITIVE_INFINITY
      ? t("figures.durationNeverSub")
      : f.durationS > 0
        ? t("figures.durationSub", { rate: fmtRate(f.burstRate) })
        : null

  const tiles = [
    { k: "extra", v: f.durationS > 0 ? fmtData(f.extraMB * 8) : "—", sub: t("figures.extraSub") },
    { k: "recharge", v: f.enabled ? fmtSec(f.rechargeS) : "—", sub: t("figures.rechargeSub") },
    {
      k: "sustained",
      v: fmtRate(f.sustainedMbps),
      sub: f.repeats ? t("figures.sustainedRepeats") : t("figures.sustainedSub"),
    },
    { k: "step", v: fmtSec(f.stepS), sub: t("figures.stepSub") },
  ] as const

  return (
    <div className="surface grid gap-6 rounded-2xl p-5 sm:p-7 lg:sticky lg:top-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-300">{t("figures.title")}</h3>
        {!state.symmetric && (
          <Choice
            label={t("figures.direction")}
            value={state.view}
            onChange={onView}
            options={[
              { value: "down", label: t("params.down") },
              { value: "up", label: t("params.up") },
            ]}
            className="sm:w-fit"
          />
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-400">{t("figures.duration")}</p>
        <p className="mt-1 text-5xl font-light tracking-tight tabular-nums text-foreground sm:text-6xl">{durationValue}</p>
        {durationSub && <p className="mt-2 text-sm text-zinc-400">{durationSub}</p>}
        {f.durationS > 0 && Number.isFinite(f.approxS) && (
          <p className="mt-1 font-mono text-xs text-zinc-500">{t("figures.approx", { value: fmtSec(f.approxS) })}</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
        {tiles.map((tile) => (
          <div key={tile.k} className="surface-cell p-4">
            <dt className="text-xs text-zinc-400">{t(`figures.${tile.k}`)}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{tile.v}</dd>
            <dd className="mt-1 text-xs leading-snug text-zinc-500">{tile.sub}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h4 className="mb-2 text-xs text-zinc-400">{t("issues.title")}</h4>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CircleCheck aria-hidden className="size-4" />
            {t("issues.ok")}
          </p>
        ) : (
          <ul className="grid gap-2.5">
            {issues.map(({ dir, issue }) => {
              const Icon = ICON[issue.level]
              return (
                <li key={`${dir}-${issue.code}`} className="flex gap-2.5 text-sm leading-snug text-zinc-200">
                  <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${TONE[issue.level]}`} />
                  <span>
                    <span className={`font-medium ${TONE[issue.level]}`}>{t(`issues.level.${issue.level}`)}</span>
                    {!state.symmetric && <span className="text-zinc-400"> · {t(`params.${dir}`)}</span>}
                    {": "}
                    {t(`issues.${issue.code}`)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
