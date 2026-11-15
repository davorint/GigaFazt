"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { burstEnabled, planDefaults, ruleId } from "@/lib/mikrotik/burst"
import { simulateCapacity, sizeUplink, type CapacityInput, type Sizing } from "@/lib/mikrotik/capacity"
import { fmtNum, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { rosRate } from "@/lib/mikrotik/routeros"
import { MAX_CLIENTS_PER_PLAN, PRESETS, type CapacityState, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { MultiChart, type ChartSeries } from "./MultiChart"
import { NumberField } from "./NumberField"
import { NEUTRAL_SERIES, SERIES_COLORS } from "./ticks"

type Props = { state: LabState; onCapacity: (c: CapacityState) => void }

export function CapacityPanel({ state, onCapacity }: Props) {
  const t = useTranslations("mikrotik")
  const c = state.capacity
  const set = (patch: Partial<CapacityState>) => onCapacity({ ...c, ...patch })
  const { rule } = state
  const testS = state.pattern.testS

  const input = useMemo<Omit<CapacityInput, "parentMbps">>(
    () => ({
      plans: PRESETS.map((p, i) => ({ id: p.id, planMbps: p.downMbps, clients: c.clients[i] ?? 0, params: planDefaults(p.downMbps, rule) })),
      activeShare: c.activeShare,
      sessionS: c.sessionS,
      demandMbps: c.demandMbps,
      testS,
      lineCapMbps: state.lineCapMbps,
    }),
    [c.clients, c.activeShare, c.sessionS, c.demandMbps, rule, testS, state.lineCapMbps]
  )
  // Hundreds of clients: let typing stay responsive while the model reruns.
  const deferredInput = useDeferredValue(input)
  const deferredParent = useDeferredValue(c.parentMbps)
  const result = useMemo(() => simulateCapacity({ ...deferredInput, parentMbps: deferredParent }), [deferredInput, deferredParent])
  const stale = deferredInput !== input || deferredParent !== c.parentMbps

  // Uplink sizing runs on demand (it reruns the model ~20 times).
  const [target, setTarget] = useState(80)
  const [sizing, setSizing] = useState<{ input: typeof input; target: number; value: Sizing } | null>(null)
  const [busy, setBusy] = useState(false)
  const fresh = sizing && sizing.input === input && sizing.target === target ? sizing.value : null
  const runSizing = () => {
    setBusy(true)
    window.setTimeout(() => {
      setSizing({ input, target, value: sizeUplink(input, target / 100) })
      setBusy(false)
    }, 20)
  }

  const total = c.clients.reduce((a, b) => a + b, 0)
  const rid = ruleId(rule)
  const ruleName = rid === "custom" ? t("compare.ownRule") : t(`params.rules.${rid}`)

  const series = useMemo<ChartSeries[]>(
    () => [
      { key: "asked", label: t("capacity.chart.asked"), color: NEUTRAL_SERIES, dash: "5 3", values: result.asked },
      { key: "delivered", label: t("capacity.chart.delivered"), color: SERIES_COLORS[0], values: result.delivered },
    ],
    [result, t]
  )

  const tiles = [
    { k: "avg", v: fmtRate(result.parent.avgMbps), sub: t("capacity.stats.avgSub", { pct: fmtPct(result.parent.avgMbps / Math.max(1e-9, deferredParent)) }) },
    { k: "p95", v: fmtRate(result.parent.p95Mbps), sub: t("capacity.stats.p95Sub") },
    { k: "saturated", v: fmtPct(result.parent.saturatedShare), sub: t("capacity.stats.saturatedSub") },
  ] as const

  const summary = t("capacity.chart.summary", {
    clients: fmtNum(result.clients, 0),
    parent: fmtRate(deferredParent),
    avg: fmtRate(result.parent.avgMbps),
    saturated: fmtPct(result.parent.saturatedShare),
    lines: result.plans
      .filter((p) => p.clients > 0)
      .map((p) => t("capacity.chart.line", { plan: speedLabel(p.planMbps), test: fmtRate(p.testMbps) }))
      .join(" "),
  })

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label={t("capacity.parent")}
          unit={t("params.unitMbps")}
          value={c.parentMbps}
          min={1}
          max={1e7}
          hint={t("capacity.parentHint")}
          onChange={(v) => v !== null && set({ parentMbps: v })}
        />
        <NumberField
          label={t("capacity.active")}
          unit="%"
          value={Math.round(c.activeShare * 1000) / 10}
          max={100}
          hint={t("capacity.activeHint")}
          onChange={(v) => v !== null && set({ activeShare: v / 100 })}
        />
        <NumberField
          label={t("capacity.session")}
          unit={t("params.unitS")}
          value={c.sessionS}
          min={1}
          max={3600}
          hint={t("capacity.sessionHint")}
          onChange={(v) => v !== null && set({ sessionS: v })}
        />
        <NumberField
          label={t("capacity.demand")}
          unit={t("params.unitMbps")}
          value={c.demandMbps}
          optional
          min={0.001}
          hint={t("capacity.demandHint")}
          onChange={(v) => set({ demandMbps: v })}
        />
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-3 font-mono text-xs text-zinc-300">{t("capacity.clients", { total: fmtNum(total, 0) })}</legend>
        <div className="grid items-start gap-4 sm:grid-cols-3">
          {PRESETS.map((p, i) => (
            <NumberField
              key={p.id}
              label={t("capacity.clientsOf", { plan: speedLabel(p.downMbps) })}
              unit={t("capacity.unitClients")}
              value={c.clients[i] ?? 0}
              integer
              max={MAX_CLIENTS_PER_PLAN}
              onChange={(v) => v !== null && set({ clients: c.clients.map((n, k) => (k === i ? v : n)) })}
            />
          ))}
        </div>
        <p className="text-xs leading-snug text-zinc-400">{t("capacity.clientsHint")}</p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-zinc-400">
          {t("capacity.using", { rule: ruleName, test: fmtSec(testS) })}{" "}
          <a href="#parametros" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("sim.edit")}
          </a>
        </p>
        <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">
          {t("sim.tag")}
        </span>
      </div>

      <div className={`grid min-w-0 gap-7 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale || undefined}>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.k} className="surface-cell p-4">
              <dt className="text-xs text-zinc-400">{t(`capacity.stats.${tile.k}`)}</dt>
              <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{tile.v}</dd>
              <dd className="mt-1 text-xs leading-snug text-zinc-500">{tile.sub}</dd>
            </div>
          ))}
        </dl>

        <MultiChart
          mode="line"
          label={t("capacity.chart.label")}
          summary={summary}
          axisY={t("chart.axisY")}
          axisX={t("chart.axisX")}
          dt={result.bucketS}
          durationS={result.delivered.length * result.bucketS}
          series={series}
          refs={[{ key: "parent", label: t("capacity.chart.parentRef", { value: rosRate(deferredParent) }), v: deferredParent, dash: "", color: "rgb(244 244 245 / 0.6)" }]}
          timeLabel={(value) => t("chart.tip.t", { value })}
          tableLabel={t("capacity.chart.table")}
          tableCaption={t("capacity.chart.tableCaption", { step: fmtSec(result.bucketS) })}
          timeCol={t("chart.col.t")}
        />

        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("capacity.resultsCaption")}>
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">{t("capacity.resultsCaption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {(["plan", "clients", "queue", "active", "test", "worst", "plain"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                    {k === "test" ? t("capacity.cols.test", { s: fmtSec(testS) }) : t(`capacity.cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {result.plans.map((p) => {
                const q = deferredInput.plans.find((x) => x.id === p.id)?.params
                const pct = (v: number) => ` (${fmtPct(v / p.planMbps)})`
                const none = p.clients === 0
                return (
                  <tr key={p.id} className="border-t border-white/5">
                    <th scope="row" className="px-3 py-2.5 text-left font-sans text-sm font-normal whitespace-nowrap text-foreground">
                      {speedLabel(p.planMbps)}
                    </th>
                    <td className="px-3 py-2.5">{fmtNum(p.clients, 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {q ? (burstEnabled(q) ? `${rosRate(q.maxLimit)} · ${rosRate(q.burstLimit)}` : `${rosRate(q.maxLimit)} · ${t("compare.noBurst")}`) : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{none ? "—" : `${fmtRate(p.activeAvgMbps)}${pct(p.activeAvgMbps)}`}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{none ? "—" : `${fmtRate(p.testMbps)}${pct(p.testMbps)}`}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{none ? "—" : `${fmtRate(p.testP10Mbps)}${pct(p.testP10Mbps)}`}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{none ? "—" : `${fmtRate(p.testPlainMbps)}${pct(p.testPlainMbps)}`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <h3 className="text-sm font-medium text-foreground">{t("capacity.sizing.title")}</h3>
        <div className="flex flex-wrap items-start gap-4">
          <NumberField
            label={t("capacity.sizing.target")}
            hint={t("capacity.sizing.targetHint")}
            unit="%"
            value={target}
            min={1}
            max={100}
            onChange={(v) => v !== null && setTarget(v)}
            className="w-56"
          />
          <Button type="button" onClick={runSizing} disabled={busy || total === 0} className="sm:mt-[1.375rem]">
            {busy && <Loader2 aria-hidden className="animate-spin" />}
            {t("capacity.sizing.run")}
          </Button>
        </div>
        <div aria-live="polite" className="text-sm leading-relaxed text-zinc-200">
          {busy ? (
            t("capacity.sizing.busy")
          ) : fresh ? (
            fresh.ok ? (
              <div className="grid gap-3">
                <p>
                  {t("capacity.sizing.ok", { parent: fmtRate(fresh.parentMbps), target: fmtPct(target / 100), share: fmtPct(fresh.share) })}
                </p>
                <div>
                  <Button type="button" variant="outline" onClick={() => set({ parentMbps: fresh.parentMbps })} disabled={c.parentMbps === fresh.parentMbps}>
                    {c.parentMbps === fresh.parentMbps && <Check aria-hidden />}
                    {t("capacity.sizing.use", { parent: rosRate(fresh.parentMbps) })}
                  </Button>
                </div>
              </div>
            ) : (
              <p>
                {fresh.id
                  ? t("capacity.sizing.impossible", {
                      target: fmtPct(target / 100),
                      best: fmtPct(fresh.bestShare),
                      plan: speedLabel(PRESETS.find((p) => p.id === fresh.id)?.downMbps ?? 0),
                    })
                  : t("capacity.sizing.noClients")}
              </p>
            )
          ) : (
            <p className="text-zinc-400">{t("capacity.sizing.hint")}</p>
          )}
        </div>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-zinc-400">{t("capacity.model")}</p>
    </div>
  )
}
