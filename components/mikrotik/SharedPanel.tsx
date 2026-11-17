"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { KINDS, type PatternKind, type TransferStats } from "@/lib/mikrotik/burst"
import { fmtData, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { hostTargets, networkOf } from "@/lib/mikrotik/bulk"
import { rosRate, sharedPpp, sharedSimpleQueues } from "@/lib/mikrotik/routeros"
import { simulateShared } from "@/lib/mikrotik/shared"
import {
  DEFAULT_GROUP,
  MAX_DURATION_S,
  MAX_MEMBERS,
  memberPair,
  memberSetup,
  PRESETS,
  type GroupMember,
  type GroupState,
  type LabState,
} from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { CodeBlock } from "./CodeBlock"
import { MultiChart, type ChartSeries } from "./MultiChart"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { SetupChecks } from "./SetupChecks"
import { TextField } from "./TextField"
import { SERIES_COLORS } from "./ticks"

const PRIORITIES = [1, 2, 3, 4, 5, 6, 7, 8]

/** The scenario as RouterOS config: a parent simple queue with one child per client, or PPP profiles under it. */
function SharedExport({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik")
  const g = state.group
  const [parent, setParent] = useState("padre")
  const [network, setNetwork] = useState("10.0.0.0/24")
  const name = parent.trim() || "padre"
  const net = networkOf(network)
  const targets = hostTargets(network, g.members.length)
  const children = g.members.map((m, i) => ({
    name: `cliente-${i + 1}`,
    target: targets?.[i] ?? "",
    pair: memberPair(state, m),
    priority: m.priority,
  }))
  const ppp = sharedPpp({ parent: name, target: net ?? "", maxLimit: g.parentMbps, children, queue: state.queueKind })

  return (
    <details className="surface rounded-xl">
      <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5">
        {t("shared.export.title")}
      </summary>
      <div className="grid min-w-0 gap-5 px-4 pb-5 sm:px-5">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("shared.export.lead")}</p>
        <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
          <TextField label={t("shared.export.parent")} value={parent} onChange={setParent} />
          <TextField label={t("shared.export.network")} value={network} onChange={setNetwork} hint={t("shared.export.networkHint")} />
        </div>
        {net && targets ? (
          <Tabs defaultValue="simple" className="min-w-0 gap-5">
            <TabsList className="w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto sm:w-fit">
              {(["simple", "ppp"] as const).map((k) => (
                <TabsTrigger key={k} value={k} className="h-8 flex-none px-3">
                  {t(`shared.export.tabs.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="simple" className="grid min-w-0 gap-4">
              <CodeBlock
                label={t("shared.export.tabs.simple")}
                code={sharedSimpleQueues({ parent: name, target: net, maxLimit: g.parentMbps, children, queue: state.queueKind })}
              />
              <p className="text-sm text-zinc-400">{t("shared.export.notes.simple")}</p>
            </TabsContent>
            <TabsContent value="ppp" className="grid min-w-0 gap-4">
              <CodeBlock label={t("shared.export.tabs.ppp")} code={ppp.script} />
              <ul className="grid gap-1 font-mono text-xs text-zinc-300">
                {ppp.names.map((profile, i) => (
                  <li key={i}>{t("shared.export.profileOf", { client: t("shared.member", { n: i + 1 }), profile })}</li>
                ))}
              </ul>
              <p className="text-sm text-zinc-400">{t("shared.export.notes.ppp")}</p>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="flex gap-2.5 text-sm leading-snug text-zinc-200">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
            {t("shared.export.badNetwork", { count: g.members.length })}
          </p>
        )}
        <SetupChecks compact href="/interno/mikrotik#antes-de-pegar" />
      </div>
    </details>
  )
}

export function SharedPanel({ state, onGroup }: { state: LabState; onGroup: (g: GroupState) => void }) {
  const t = useTranslations("mikrotik")
  const g = state.group
  const set = (patch: Partial<GroupState>) => onGroup({ ...g, ...patch })
  const setMember = (i: number, patch: Partial<GroupMember>) => set({ members: g.members.map((m, k) => (k === i ? { ...m, ...patch } : m)) })
  const add = () => {
    const next = DEFAULT_GROUP.members[g.members.length % DEFAULT_GROUP.members.length]
    set({ members: [...g.members, { ...next, startS: 0 }] })
  }
  const remove = (i: number) => set({ members: g.members.filter((_, k) => k !== i) })

  const setups = useMemo(() => g.members.map((m) => memberSetup(state, m)), [g.members, state])
  const result = useMemo(
    () =>
      simulateShared(
        g.parentMbps,
        setups.map((s, i) => ({ ...s, priority: g.members[i].priority })),
        g.durationS,
        { lineCapMbps: state.lineCapMbps }
      ),
    [g.parentMbps, g.durationS, g.members, setups, state.lineCapMbps]
  )

  const name = (i: number) => t("shared.member", { n: i + 1 })
  const planLabel = (m: GroupMember) => {
    const preset = PRESETS.find((p) => p.id === m.plan)
    return preset ? speedLabel(preset.downMbps) : t("shared.planCurrent")
  }

  const series = useMemo<ChartSeries[]>(
    () =>
      g.members.map((m, i) => ({
        key: `m${i}`,
        label: `${t("shared.member", { n: i + 1 })} · ${t(`sim.kinds.${m.kind}`)}`,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        values: result.samples.map((s) => s.rates[i]),
      })),
    [g.members, result, t]
  )
  const shade = useMemo(() => result.samples.map((s) => s.congested), [result])
  const note = (i: number, step: number) => {
    const s = result.samples[step]
    if (!s) return null
    if (s.rates[i] < s.asks[i] - 1e-6) return t("shared.tip.trimmed")
    if (s.rates[i] > setups[i].params.maxLimit + 1e-9) return t("shared.tip.bursting")
    return null
  }

  const limitSum = g.members.reduce((a, m) => a + m.limitAt, 0)
  const outcome = (tr: TransferStats | null) => {
    if (!tr) return t("shared.result.none")
    if (tr.kind === "download") return tr.finishS === null ? t("shared.result.downloadNever") : t("shared.result.download", { value: fmtSec(tr.finishS) })
    if (tr.kind === "video")
      return tr.startupS === null ? t("shared.result.videoNever") : t("shared.result.video", { startup: fmtSec(tr.startupS), stall: fmtSec(tr.stallS) })
    return tr.meanS === null ? t("shared.result.none") : t("shared.result.web", { value: fmtSec(tr.meanS) })
  }

  const summary = t("shared.summary", {
    count: g.members.length,
    parent: fmtRate(g.parentMbps),
    congested: fmtSec(result.parent.congestedS),
    duration: fmtSec(result.durationS),
    lines: result.members
      .map((m, i) => t("shared.summaryLine", { client: name(i), total: fmtData(m.totalMb), burst: fmtSec(m.burstS) }))
      .join(" "),
  })

  const tiles = [
    {
      k: "parentAvg",
      v: fmtRate(result.parent.avgMbps),
      sub: t("shared.stats.parentAvgSub", { pct: fmtPct(result.parent.avgMbps / g.parentMbps) }),
    },
    { k: "parentPeak", v: fmtRate(result.parent.peakMbps), sub: t("shared.stats.parentPeakSub") },
    { k: "congested", v: fmtSec(result.parent.congestedS), sub: t("shared.stats.congestedSub") },
  ] as const

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <NumberField
          label={t("shared.parent")}
          unit={t("params.unitMbps")}
          value={g.parentMbps}
          min={0.001}
          hint={t("shared.parentHint")}
          onChange={(v) => v !== null && set({ parentMbps: v })}
        />
        <NumberField
          label={t("shared.duration")}
          unit={t("params.unitS")}
          value={g.durationS}
          min={1}
          max={MAX_DURATION_S}
          onChange={(v) => v !== null && set({ durationS: v })}
        />
      </div>

      <ul className="grid gap-3 xl:grid-cols-2">
        {g.members.map((m, i) => (
          <li key={i} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span aria-hidden className="size-3 rounded-[3px]" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                {name(i)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(i)}
                disabled={g.members.length <= 1}
                aria-label={t("shared.remove", { n: i + 1 })}
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
              <SelectField
                label={t("shared.traffic")}
                value={m.kind}
                onChange={(kind) => setMember(i, { kind: kind as PatternKind })}
                className="col-span-2"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`sim.kinds.${k}`)}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t("shared.plan")} value={m.plan} onChange={(plan) => setMember(i, { plan })}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {speedLabel(p.downMbps)}
                  </option>
                ))}
                <option value="current">{t("shared.planCurrent")}</option>
              </SelectField>
              <NumberField
                label={t("shared.start")}
                unit={t("params.unitS")}
                value={m.startS}
                max={3600}
                onChange={(v) => v !== null && setMember(i, { startS: v })}
              />
              <NumberField
                label={t("shared.limitAt")}
                unit={t("params.unitMbps")}
                value={m.limitAt}
                onChange={(v) => v !== null && setMember(i, { limitAt: v })}
              />
              <SelectField
                label={t("shared.priority")}
                value={String(m.priority)}
                onChange={(v) => setMember(i, { priority: Number(v) })}
                hint={t("shared.priorityHint")}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </SelectField>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" variant="outline" onClick={add} disabled={g.members.length >= MAX_MEMBERS}>
          <Plus aria-hidden />
          {t("shared.add")}
        </Button>
        <p className="text-xs text-zinc-400">
          {t("shared.limit", { max: MAX_MEMBERS })} {t("shared.sizes")}
        </p>
      </div>

      {limitSum > g.parentMbps + 1e-9 && (
        <p className="flex gap-2.5 text-sm leading-snug text-zinc-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
          {t("shared.overbooked", { sum: fmtRate(limitSum), parent: fmtRate(g.parentMbps) })}
        </p>
      )}

      <div className="grid min-w-0 gap-3">
        <div className="flex items-center justify-end">
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">
            {t("sim.tag")}
          </span>
        </div>
        <MultiChart
          mode="stack"
          label={t("shared.label")}
          summary={summary}
          axisY={t("chart.axisY")}
          axisX={t("chart.axisX")}
          dt={result.stepS}
          durationS={result.durationS}
          series={series}
          refs={[{ key: "parent", label: t("shared.parentRef", { value: rosRate(g.parentMbps) }), v: g.parentMbps, dash: "", color: "rgb(244 244 245 / 0.6)" }]}
          shade={shade}
          shadeLabel={t("shared.congested")}
          totalLabel={t("shared.total")}
          timeLabel={(value) => t("chart.tip.t", { value })}
          note={note}
          tableLabel={t("shared.table")}
          tableCaption={t("shared.tableCaption", { step: fmtSec(result.stepS) })}
          timeCol={t("chart.col.t")}
        />
      </div>

      <dl className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.k} className="surface-cell p-4">
            <dt className="text-xs text-zinc-400">{t(`shared.stats.${tile.k}`)}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{tile.v}</dd>
            <dd className="mt-1 text-xs leading-snug text-zinc-500">{tile.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("shared.resultsCaption")}>
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">{t("shared.resultsCaption")}</caption>
          <thead className="text-xs text-zinc-400">
            <tr className="border-b border-white/10">
              {(["client", "setup", "activeAvg", "total", "burst", "guarantee", "result"] as const).map((c) => (
                <th key={c} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                  {t(`shared.cols.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs tabular-nums">
            {result.members.map((ms, i) => {
              const m = g.members[i]
              return (
                <tr key={i} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2.5 text-left font-sans text-sm font-normal whitespace-nowrap text-foreground">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {name(i)}
                    </span>
                  </th>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {planLabel(m)} · {m.priority} · {m.limitAt > 0 ? rosRate(m.limitAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtRate(ms.activeAvgMbps)}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtData(ms.totalMb)}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{fmtSec(ms.burstS)}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{ms.guaranteeMet === null ? "—" : fmtPct(ms.guaranteeMet)}</td>
                  <td className="px-3 py-2.5 font-sans whitespace-nowrap text-zinc-300">{outcome(ms.transfer)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-zinc-400">{t("shared.model")}</p>

      <SharedExport state={state} />
    </div>
  )
}
