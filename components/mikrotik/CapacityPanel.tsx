"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { burstEnabled, planDefaults, ruleId } from "@/lib/mikrotik/burst"
import { MAX_HOMES_PER_PORT, PON_RATES, portCapacity, type CapacityInput, type CapacityResult, type PonTech, type Sizing } from "@/lib/mikrotik/capacity"
import { CapacityClient } from "@/lib/mikrotik/capacity-client"
import { fmtNum, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { rosRate } from "@/lib/mikrotik/routeros"
import { MAX_CLIENTS_PER_PLAN, PRESETS, type CapacityState, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { Choice } from "./Choice"
import { MultiChart, type ChartSeries } from "./MultiChart"
import { NumberField } from "./NumberField"
import { SERIES_COLORS } from "./ticks"

type Props = { state: LabState; onCapacity: (c: CapacityState) => void }
type SimInput = CapacityInput
type SizeInput = Omit<CapacityInput, "parentMbps">

const TECHS: PonTech[] = ["gpon", "xgspon", "none"]

export function CapacityPanel({ state, onCapacity }: Props) {
  const t = useTranslations("mikrotik")
  const c = state.capacity
  const set = (patch: Partial<CapacityState>) => onCapacity({ ...c, ...patch })
  const { rule } = state
  const testS = state.pattern.testS
  const down = c.direction === "down"
  const avg = down ? c.avgDownMbps : c.avgUpMbps

  const sizeInput = useMemo<SizeInput>(
    () => ({
      plans: PRESETS.map((p, i) => ({
        id: p.id,
        planMbps: down ? p.downMbps : p.upMbps,
        clients: c.clients[i] ?? 0,
        params: planDefaults(down ? p.downMbps : p.upMbps, rule),
      })),
      direction: c.direction,
      avgMbps: avg,
      videoShare: c.videoShare,
      videoMbps: c.videoMbps,
      fileMB: c.fileMB,
      pon: { tech: c.pon, homesPerPort: c.homesPerPort },
      testS,
      lineCapMbps: state.lineCapMbps,
    }),
    [c.clients, c.direction, down, avg, c.videoShare, c.videoMbps, c.fileMB, c.pon, c.homesPerPort, rule, testS, state.lineCapMbps]
  )
  const simInput = useMemo<SimInput>(() => ({ ...sizeInput, parentMbps: c.parentMbps }), [sizeInput, c.parentMbps])
  const simKey = useMemo(() => JSON.stringify(simInput), [simInput])
  const sizeKey = useMemo(() => JSON.stringify(sizeInput), [sizeInput])

  // The model runs in a worker; results come back tagged with the inputs they're for.
  const [result, setResult] = useState<{ key: string; value: CapacityResult } | null>(null)
  const [sizing, setSizing] = useState<{ key: string; target: number; value: Sizing } | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const client = useRef<CapacityClient | null>(null)
  const pendingSim = useRef("")
  const pendingSize = useRef({ key: "", target: 0 })

  useEffect(() => {
    const cl = new CapacityClient({
      onResult: (value) => setResult({ key: pendingSim.current, value }),
      onSizing: (value) => {
        setSizing({ ...pendingSize.current, value })
        setProgress(null)
      },
      onProgress: (done) => setProgress(done),
    })
    client.current = cl
    return () => {
      cl.dispose()
      client.current = null
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      pendingSim.current = simKey
      client.current?.simulate(simInput)
    }, 120)
    return () => window.clearTimeout(id)
  }, [simInput, simKey])

  const [target, setTarget] = useState(80)
  const busy = progress !== null
  const runSizing = () => {
    pendingSize.current = { key: sizeKey, target }
    setProgress(0)
    client.current?.size(sizeInput, target / 100)
  }
  const fresh = sizing && sizing.key === sizeKey && sizing.target === target ? sizing.value : null

  const r = result?.value ?? null
  const stale = !result || result.key !== simKey
  const total = c.clients.reduce((a, b) => a + b, 0)
  const rid = ruleId(rule)
  const ruleName = rid === "custom" ? t("compare.ownRule") : t(`params.rules.${rid}`)
  const portCap = portCapacity({ pon: { tech: c.pon, homesPerPort: c.homesPerPort }, direction: c.direction })
  const pon = c.pon !== "none"

  const series = useMemo<ChartSeries[]>(() => {
    if (!r) return []
    const list: ChartSeries[] = [{ key: "uplink", label: t("capacity.chart.uplink"), color: SERIES_COLORS[0], values: r.delivered }]
    if (r.ports) list.push({ key: "port", label: t("capacity.chart.port"), color: SERIES_COLORS[1], values: r.busiestPort })
    return list
  }, [r, t])

  const offeredOver = r !== null && r.offeredMbps >= c.parentMbps
  const portOver = r !== null && r.offeredPerPortMbps !== null && r.ports !== null && r.offeredPerPortMbps >= r.ports.capacityMbps

  const tiles = r
    ? [
        {
          k: "avg",
          v: fmtRate(r.parent.avgMbps),
          sub: t("capacity.stats.avgSub", { pct: fmtPct(r.parent.avgMbps / Math.max(1e-9, c.parentMbps)) }),
        },
        { k: "p95", v: fmtRate(r.parent.p95Mbps), sub: t("capacity.stats.p95Sub") },
        { k: "saturated", v: fmtPct(r.parent.saturatedShare), sub: t("capacity.stats.saturatedSub") },
        ...(r.ports
          ? [
              {
                k: "port",
                v: fmtRate(r.ports.p95Mbps),
                sub: t("capacity.stats.portSub", {
                  pct: fmtPct(r.ports.p95Mbps / r.ports.capacityMbps),
                  ports: fmtNum(r.ports.count, 0),
                  saturated: fmtPct(r.ports.saturatedShare),
                }),
              },
            ]
          : []),
        ...(r.videoShortShare !== null ? [{ k: "video", v: fmtPct(r.videoShortShare), sub: t("capacity.stats.videoSub") }] : []),
        { k: "perClient", v: fmtRate(r.perClientMbps), sub: t("capacity.stats.perClientSub", { avg: fmtRate(avg) }) },
      ]
    : []

  const summary = r
    ? t("capacity.chart.summary", {
        clients: fmtNum(r.clients, 0),
        parent: fmtRate(c.parentMbps),
        avg: fmtRate(r.parent.avgMbps),
        saturated: fmtPct(r.parent.saturatedShare),
        lines: r.plans
          .filter((p) => p.clients > 0)
          .map((p) => t("capacity.chart.line", { plan: speedLabel(p.planMbps), test: fmtRate(p.testP10Mbps) }))
          .join(" "),
      })
    : ""

  const perPortText = (n: number) =>
    n === 0 ? t("capacity.sizing.perPortNone") : n >= MAX_HOMES_PER_PORT ? t("capacity.sizing.perPortMax", { n: MAX_HOMES_PER_PORT }) : fmtNum(n, 0)
  const planName = (id: string | null) => speedLabel(PRESETS.find((p) => p.id === id)?.[down ? "downMbps" : "upMbps"] ?? 0)

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("capacity.direction")}</p>
            <Choice
              label={t("capacity.direction")}
              value={c.direction}
              onChange={(direction) => set({ direction })}
              options={[
                { value: "down", label: t("params.down") },
                { value: "up", label: t("params.up") },
              ]}
            />
          </div>
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("capacity.pon")}</p>
            <Choice label={t("capacity.pon")} value={c.pon} onChange={(pon) => set({ pon })} options={TECHS.map((k) => ({ value: k, label: t(`capacity.pons.${k}`) }))} />
          </div>
        </div>

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
            label={t("capacity.avg")}
            unit={t("params.unitMbps")}
            value={avg}
            max={1e4}
            hint={t(down ? "capacity.avgHintDown" : "capacity.avgHintUp")}
            onChange={(v) => v !== null && set(down ? { avgDownMbps: v } : { avgUpMbps: v })}
          />
          {pon && (
            <NumberField
              label={t("capacity.homes")}
              unit={t("capacity.unitClients")}
              value={c.homesPerPort}
              integer
              min={1}
              max={1024}
              hint={t("capacity.homesHint", { cap: fmtRate(portCap), tech: t(`capacity.pons.${c.pon}`) })}
              onChange={(v) => v !== null && set({ homesPerPort: v })}
            />
          )}
          <NumberField
            label={t("capacity.fileMB")}
            unit={t("sim.unitMB")}
            value={c.fileMB}
            min={0.001}
            max={1e6}
            hint={t("capacity.fileHint")}
            onChange={(v) => v !== null && set({ fileMB: v })}
          />
          {down && (
            <>
              <NumberField
                label={t("capacity.videoShare")}
                unit="%"
                value={Math.round(c.videoShare * 1000) / 10}
                max={100}
                hint={t("capacity.videoShareHint")}
                onChange={(v) => v !== null && set({ videoShare: v / 100 })}
              />
              <NumberField
                label={t("capacity.videoMbps")}
                unit={t("params.unitMbps")}
                value={c.videoMbps}
                min={0.001}
                max={1e4}
                hint={t("sim.videoHint")}
                onChange={(v) => v !== null && set({ videoMbps: v })}
              />
            </>
          )}
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-zinc-400">
          {t("capacity.using", { rule: ruleName, test: fmtSec(testS) })}{" "}
          <a href="#parametros" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("sim.edit")}
          </a>
        </p>
        <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">{t("sim.tag")}</span>
      </div>

      {(offeredOver || portOver) && r && (
        <div className="grid gap-2">
          {offeredOver && (
            <p className="flex gap-2.5 text-sm leading-snug text-zinc-200">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
              {t("capacity.overUplink", { offered: fmtRate(r.offeredMbps), parent: fmtRate(c.parentMbps) })}
            </p>
          )}
          {portOver && r.ports && (
            <p className="flex gap-2.5 text-sm leading-snug text-zinc-200">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
              {t("capacity.overPort", { offered: fmtRate(r.offeredPerPortMbps ?? 0), cap: fmtRate(r.ports.capacityMbps), homes: fmtNum(c.homesPerPort, 0) })}
            </p>
          )}
        </div>
      )}

      {r ? (
        <div className={`grid min-w-0 gap-7 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale || undefined}>
          <dl className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
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
            dt={r.bucketS}
            durationS={r.delivered.length * r.bucketS}
            series={series}
            refs={[
              { key: "parent", label: t("capacity.chart.parentRef", { value: rosRate(c.parentMbps) }), v: c.parentMbps, dash: "", color: "rgb(244 244 245 / 0.6)" },
              ...(r.ports
                ? [{ key: "pon", label: t("capacity.chart.ponRef", { value: rosRate(Math.round(r.ports.capacityMbps)) }), v: r.ports.capacityMbps, dash: "4 4", color: "rgb(244 244 245 / 0.45)" }]
                : []),
            ]}
            shade={r.saturated}
            shadeLabel={t("capacity.chart.saturated")}
            timeLabel={(value) => t("chart.tip.t", { value })}
            tableLabel={t("capacity.chart.table")}
            tableCaption={t("capacity.chart.tableCaption", { step: fmtSec(r.bucketS) })}
            timeCol={t("chart.col.t")}
          />

          <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("capacity.resultsCaption")}>
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">{t("capacity.resultsCaption")}</caption>
              <thead className="text-xs text-zinc-400">
                <tr className="border-b border-white/10">
                  {(["plan", "clients", "queue", "transfers", "test", "worst", "plain"] as const).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                      {k === "test" ? t("capacity.cols.test", { s: fmtSec(testS) }) : t(`capacity.cols.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-xs tabular-nums">
                {r.plans.map((p) => {
                  const q = sizeInput.plans.find((x) => x.id === p.id)?.params
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
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{none || p.transfers === 0 ? "—" : `${fmtRate(p.transferMbps)}${pct(p.transferMbps)}`}</td>
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
      ) : (
        <p className="flex items-center gap-2 text-sm text-zinc-400" aria-live="polite">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t("capacity.running")}
        </p>
      )}

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
            <div className="grid max-w-md gap-2">
              <p>{t("capacity.sizing.busy", { pct: fmtPct(progress ?? 0) })}</p>
              <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div className="h-full bg-white/60 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
            </div>
          ) : fresh ? (
            <div className="grid gap-3">
              {fresh.uplink.ok ? (
                <>
                  <p>{t("capacity.sizing.ok", { parent: fmtRate(fresh.uplink.parentMbps), target: fmtPct(target / 100) })}</p>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fresh.uplink.ok && set({ parentMbps: fresh.uplink.parentMbps })}
                      disabled={c.parentMbps === fresh.uplink.parentMbps}
                    >
                      {c.parentMbps === fresh.uplink.parentMbps && <Check aria-hidden />}
                      {t("capacity.sizing.use", { parent: rosRate(fresh.uplink.parentMbps) })}
                    </Button>
                  </div>
                </>
              ) : (
                <p>
                  {fresh.uplink.limit === "none"
                    ? t("capacity.sizing.noClients")
                    : fresh.uplink.limit === "pon"
                      ? t("capacity.sizing.limitPon", { target: fmtPct(target / 100), homes: fmtNum(c.homesPerPort, 0), tech: t(`capacity.pons.${c.pon}`) })
                      : t("capacity.sizing.limitQueue", { target: fmtPct(target / 100), best: fmtPct(fresh.uplink.bestShare), plan: planName(fresh.uplink.id) })}
                </p>
              )}
              {(fresh.uplink.ok || fresh.uplink.limit !== "none") && (
                <p className="text-zinc-300">
                  {t("capacity.sizing.perPort", {
                    target: fmtPct(target / 100),
                    gpon: perPortText(fresh.perPort.gpon),
                    xgspon: perPortText(fresh.perPort.xgspon),
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-zinc-400">{t("capacity.sizing.hint")}</p>
          )}
        </div>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-zinc-400">
        {t("capacity.model", { gponDown: fmtRate(PON_RATES.gpon.down), gponUp: fmtRate(PON_RATES.gpon.up), xgs: fmtRate(PON_RATES.xgspon.down) })}
      </p>
    </div>
  )
}
