"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { burstEnabled, planDefaults, ruleId } from "@/lib/mikrotik/burst"
import {
  MAX_HOMES_PER_PORT,
  PON_RATES,
  portCapacity,
  type CapacityInput,
  type CapacityResult,
  type Links,
  type OltConfig,
  type PonTech,
  type Sizing,
} from "@/lib/mikrotik/capacity"
import { usableSpeed } from "@/lib/mikrotik/balance"
import { CapacityClient } from "@/lib/mikrotik/capacity-client"
import { averageOf, homesPerPortOf, portsOf } from "@/lib/mikrotik/deployments"
import { fmtNum, fmtPct, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { checkOlt, OLT_MODELS, OLT_SPECS, type OltModelId } from "@/lib/mikrotik/olt"
import { rosRate } from "@/lib/mikrotik/routeros"
import { MAX_CLIENTS_PER_PLAN, MAX_PORTS, PRESETS, type CapacityState, type DeploymentStatus, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { Choice } from "./Choice"
import { CopyButton } from "./CopyButton"
import { IssueList } from "./IssueList"
import { MultiChart, type ChartSeries } from "./MultiChart"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { SERIES_COLORS } from "./ticks"

/** Busy-hour averages measured on another saved deployment that already runs. */
export type MeasuredAverage = { id: string; name: string; down: number | null; up: number | null }

type Props = {
  state: LabState
  onCapacity: (c: CapacityState) => void
  onStatus: (status: DeploymentStatus) => void
  measuredAverages: MeasuredAverage[]
}
type SizeInput = Omit<CapacityInput, "parentMbps">

const TECHS: PonTech[] = ["gpon", "xgpon", "xgspon", "none"]
const LINK = "text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white"
const round3 = (v: number) => Math.round(v * 1000) / 1000

/** A quick reading of the providers' interfaces (rx = download, tx = upload). */
function monitorCommand(ifaces: string[]): string {
  const names = ifaces.map((i) => i.trim()).filter(Boolean)
  const list = names.every((n) => /^[A-Za-z0-9._-]+$/.test(n)) ? names.join(",") : `"${names.join(",").replace(/["\\]/g, "")}"`
  return `/interface monitor-traffic interface=${list} once`
}

/** One deployment (an OLT and its router, with its own internet providers) at the busiest hour. */
export function CapacityPanel({ state, onCapacity, onStatus, measuredAverages }: Props) {
  const t = useTranslations("mikrotik")
  const c = state.capacity
  const set = (patch: Partial<CapacityState>) => onCapacity({ ...c, ...patch })
  const { rule } = state
  const testS = state.pattern.testS
  const down = c.direction === "down"
  const ponOn = c.pon !== "none"
  // A deployment that already runs uses what was measured on it: ports in use, the router's traffic.
  const existing = state.status === "existing"
  const average = averageOf({ status: state.status, capacity: c }, c.direction)
  const avg = average.mbps
  const homes = homesPerPortOf({ status: state.status, capacity: c })
  const fromPorts = existing && c.portsInUse !== null
  const measured = down ? c.measuredDownMbps : c.measuredUpMbps

  // The router's links, balanced as in "Varios enlaces": per client unless PCC also hashes the ports.
  const mode: Links["mode"] = state.balance.classifier === "both-addresses-and-ports" ? "connection" : "client"
  // What the links really carry in this direction: measured speeds when known, after their queues.
  const speeds = c.internet === "links" ? state.wans.map((w) => usableSpeed(w, c.direction, state.balance.queues)).join(",") : ""
  const links = useMemo<Links | null>(() => (speeds ? { mbps: speeds.split(",").map(Number), mode } : null), [speeds, mode])
  const olt = useMemo<OltConfig | null>(() => (ponOn && c.oltUplinkMbps > 0 ? { uplinkMbps: c.oltUplinkMbps } : null), [ponOn, c.oltUplinkMbps])

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
      pon: { tech: c.pon, homesPerPort: homes, efficiency: c.ponEfficiency },
      olt,
      links,
      testS,
      lineCapMbps: state.lineCapMbps,
    }),
    [c.clients, c.direction, down, avg, c.videoShare, c.videoMbps, c.fileMB, c.pon, homes, c.ponEfficiency, olt, links, rule, testS, state.lineCapMbps]
  )
  const simInput = useMemo<CapacityInput>(() => ({ ...sizeInput, parentMbps: links ? Number.POSITIVE_INFINITY : c.parentMbps }), [sizeInput, links, c.parentMbps])
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
  const portCap = portCapacity({ pon: { tech: c.pon, homesPerPort: c.homesPerPort, efficiency: c.ponEfficiency }, direction: c.direction })
  const techName = t(`capacity.pons.${c.pon}`)
  const modelName = t(`capacity.deployment.models.${c.oltModel}`)
  const netCap = links ? links.mbps.reduce((a, b) => a + b, 0) : c.parentMbps
  const modeName = t(`links.classifiersShort.${state.balance.classifier}`)

  // The OLT against its model: PON type, ports the clients need, split, users.
  const oltTech = c.pon === "none" ? null : c.pon
  const oltIssues = oltTech ? checkOlt({ model: c.oltModel, tech: oltTech, homesPerPort: homes, uplinkMbps: c.oltUplinkMbps, builtPorts: c.oltBuild?.ports[oltTech] }, total, fromPorts ? (c.portsInUse ?? undefined) : undefined) : []
  const need = portsOf({ status: state.status, capacity: c })
  const maxPorts = oltTech ? OLT_SPECS[c.oltModel].maxPorts[oltTech] : null

  const series = useMemo<ChartSeries[]>(() => {
    if (!r) return []
    const list: ChartSeries[] = [{ key: "uplink", label: t("capacity.chart.uplink"), color: SERIES_COLORS[0], values: r.delivered }]
    if (r.ports) list.push({ key: "port", label: t("capacity.chart.port"), color: SERIES_COLORS[1], values: r.busiestPort })
    return list
  }, [r, t])

  // Stages whose clients ask on average for more than they carry: results never settle.
  const warnings: string[] = []
  if (r) {
    if (!r.links && r.offeredMbps >= c.parentMbps) warnings.push(t("capacity.overUplink", { offered: fmtRate(r.offeredMbps), parent: fmtRate(c.parentMbps) }))
    if (r.links && r.overLinks > 0) {
      if (r.links.perClient) {
        const worst = r.links.each.reduce((a, b) => (b.offeredMbps / b.mbps > a.offeredMbps / a.mbps ? b : a))
        warnings.push(t("capacity.overLinks", { n: r.overLinks, count: r.links.count, offered: fmtRate(worst.offeredMbps), cap: fmtRate(worst.mbps) }))
      } else warnings.push(t("capacity.overPooled", { offered: fmtRate(r.offeredMbps), cap: fmtRate(netCap) }))
    }
    if (r.overOlt && r.olt) warnings.push(t("capacity.overOlt", { offered: fmtRate(r.offeredMbps), cap: fmtRate(r.olt.uplinkMbps) }))
    if (r.ports && r.offeredPerPortMbps !== null && r.offeredPerPortMbps >= r.ports.capacityMbps)
      warnings.push(t("capacity.overPort", { offered: fmtRate(r.offeredPerPortMbps), cap: fmtRate(r.ports.capacityMbps), homes: fmtNum(homes, 0) }))
  }

  const linkNames = state.wans.map((w, k) => w.name || `WAN${k + 1}`)
  const tiles = r
    ? [
        { k: "avg", v: fmtRate(r.parent.avgMbps), sub: t("capacity.stats.avgSub", { pct: fmtPct(r.parent.avgMbps / Math.max(1e-9, netCap)), cap: fmtRate(netCap) }) },
        { k: "p95", v: fmtRate(r.parent.p95Mbps), sub: t("capacity.stats.p95Sub") },
        r.links && r.links.count > 1
          ? { k: "saturatedLinks", v: fmtPct(r.parent.saturatedShare), sub: t("capacity.stats.saturatedLinksSub") }
          : { k: "saturated", v: fmtPct(r.parent.saturatedShare), sub: t("capacity.stats.saturatedSub") },
        ...(r.olt
          ? [
              {
                k: "olt",
                v: fmtRate(r.olt.p95Mbps),
                sub: t("capacity.stats.oltSub", { pct: fmtPct(r.olt.p95Mbps / r.olt.uplinkMbps), cap: fmtRate(r.olt.uplinkMbps), saturated: fmtPct(r.olt.saturatedShare) }),
              },
            ]
          : []),
        ...(r.ports
          ? [
              {
                k: "port",
                v: fmtRate(r.ports.p95Mbps),
                sub: t("capacity.stats.portSub", { pct: fmtPct(r.ports.p95Mbps / r.ports.capacityMbps), ports: fmtNum(r.ports.count, 0), saturated: fmtPct(r.ports.saturatedShare) }),
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
        cap: fmtRate(netCap),
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
  const targetPct = fmtPct(target / 100)

  const sizingText = (s: Sizing): string => {
    const u = s.uplink
    if (u.ok) return u.links !== null && u.linkMbps !== null ? t("capacity.sizing.okLinks", { n: u.links, link: fmtRate(u.linkMbps), mode: modeName, target: targetPct }) : t("capacity.sizing.ok", { parent: fmtRate(u.parentMbps), target: targetPct })
    switch (u.limit) {
      case "none":
        return t("capacity.sizing.noClients")
      case "olt":
        return t("capacity.sizing.limitOlt", { target: targetPct, cap: fmtRate(c.oltUplinkMbps) })
      case "pon":
        return t("capacity.sizing.limitPon", { target: targetPct, homes: fmtNum(homes, 0), tech: techName })
      case "link":
        return t("capacity.sizing.limitLink", { target: targetPct, link: fmtRate(Math.max(...(links?.mbps ?? [0]))), mode: modeName, plan: planName(u.id) })
      default:
        return t("capacity.sizing.limitQueue", { target: targetPct, best: fmtPct(u.bestShare), plan: planName(u.id) })
    }
  }

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      {/* The deployment: one OLT and its router, with its own internet providers. */}
      <div className="grid gap-5 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <div className="grid gap-1">
          <h3 className="text-sm font-medium text-foreground">{t("capacity.deployment.title")}</h3>
          <p className="text-xs leading-snug text-zinc-400">{t("capacity.deployment.lead")}</p>
        </div>
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("capacity.deployment.status")}</p>
          <Choice
            label={t("capacity.deployment.status")}
            value={state.status}
            onChange={onStatus}
            options={[
              { value: "existing", label: t("capacity.deployment.statuses.existing") },
              { value: "planned", label: t("capacity.deployment.statuses.planned") },
            ]}
          />
          <p className="text-xs leading-snug text-zinc-400">{t(`capacity.deployment.statusHint.${state.status}`)}</p>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label={t("capacity.deployment.model")} value={c.oltModel} onChange={(v) => set({ oltModel: v as OltModelId })}>
            {OLT_MODELS.map((m) => (
              <option key={m} value={m}>
                {t(`capacity.deployment.models.${m}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("capacity.pon")}</p>
          <Choice label={t("capacity.pon")} value={c.pon} onChange={(pon) => set({ pon })} options={TECHS.map((k) => ({ value: k, label: t(`capacity.pons.${k}`) }))} />
        </div>
        {ponOn && (
          <>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {existing && (
                <NumberField
                  label={t("capacity.deployment.portsInUse")}
                  unit={t("capacity.deployment.unitPorts")}
                  value={c.portsInUse}
                  integer
                  optional
                  min={1}
                  max={MAX_PORTS}
                  hint={t("capacity.deployment.portsInUseHint", { cap: fmtRate(portCap), tech: techName, eff: fmtPct(c.ponEfficiency) })}
                  onChange={(v) => set({ portsInUse: v })}
                />
              )}
              {!fromPorts && (
                <NumberField
                  label={t("capacity.homes")}
                  unit={t("capacity.unitClients")}
                  value={c.homesPerPort}
                  integer
                  min={1}
                  max={1024}
                  hint={t("capacity.homesHint", { cap: fmtRate(portCap), tech: techName, eff: fmtPct(c.ponEfficiency) })}
                  onChange={(v) => v !== null && set({ homesPerPort: v })}
                />
              )}
              <NumberField
                label={t("capacity.deployment.uplink")}
                unit={t("params.unitMbps")}
                value={c.oltUplinkMbps}
                max={1e6}
                hint={t("capacity.deployment.uplinkHint")}
                onChange={(v) => v !== null && set({ oltUplinkMbps: v })}
              />
              <NumberField
                label={t("capacity.deployment.efficiency")}
                unit="%"
                value={Math.round(c.ponEfficiency * 1000) / 10}
                min={50}
                max={100}
                hint={t("capacity.deployment.efficiencyHint")}
                onChange={(v) => v !== null && set({ ponEfficiency: v / 100 })}
              />
            </div>
            <p className="text-sm text-zinc-300">
              {fromPorts
                ? maxPorts !== null && maxPorts > 0
                  ? t("capacity.deployment.portsUsed", { need: fmtNum(need, 0), homes: fmtNum(homes, 0), max: fmtNum(maxPorts, 0), tech: techName, model: modelName })
                  : t("capacity.deployment.portsUsedAny", { need: fmtNum(need, 0), homes: fmtNum(homes, 0), tech: techName })
                : maxPorts !== null && maxPorts > 0
                  ? t("capacity.deployment.ports", { need: fmtNum(need, 0), max: fmtNum(maxPorts, 0), tech: techName, model: modelName })
                  : t("capacity.deployment.portsAny", { need: fmtNum(need, 0), tech: techName })}
            </p>
            {c.oltBuild && oltTech && (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-300">
                <span>{t("capacity.deployment.built", { ports: fmtNum(c.oltBuild.ports[oltTech], 0), tech: techName })}</span>
                <a href={`/olt?arma=${encodeURIComponent(c.oltBuild.code)}#armar`} className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  {t("capacity.deployment.builtOpen")}
                </a>
                <button type="button" onClick={() => set({ oltBuild: null })} className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-100">
                  {t("capacity.deployment.builtRemove")}
                </button>
              </p>
            )}
            {!c.oltBuild && oltTech && (
              <p className="text-xs text-zinc-400">
                {t("capacity.deployment.buildHint")}{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
                <a href="/olt#armar" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  {t("capacity.deployment.buildLink")}
                </a>
              </p>
            )}
            <IssueList
              items={oltIssues.map((i) => ({
                key: i.code,
                level: i.level,
                text: t(`capacity.deployment.issues.${i.code}`, {
                  model: modelName,
                  tech: techName,
                  max: fmtNum(i.max ?? 0, 0),
                  need: fmtNum(i.need ?? 0, 0),
                  homes: fmtNum(homes, 0),
                }),
              }))}
            />
          </>
        )}
        <div className="grid gap-3">
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("capacity.deployment.internet")}</p>
            <Choice
              label={t("capacity.deployment.internet")}
              value={c.internet}
              onChange={(internet) => set({ internet })}
              options={[
                { value: "links", label: t("capacity.deployment.internets.links", { count: state.wans.length }) },
                { value: "single", label: t("capacity.deployment.internets.single") },
              ]}
            />
          </div>
          {c.internet === "links" ? (
            <div className="grid gap-2">
              <ul className="flex flex-wrap gap-2" aria-label={t("capacity.deployment.linksLabel")}>
                {state.wans.map((w, k) => (
                  <li key={k} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-zinc-200">
                    {linkNames[k]} · {fmtRate(usableSpeed(w, c.direction, state.balance.queues))}
                    {w.measuredMbps !== null && <span className="text-zinc-400"> · {t("deployments.measured")}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-zinc-300">
                {t("capacity.deployment.linksSummary", { total: fmtRate(netCap), count: state.wans.length, mode: modeName })}{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the other internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
                <a href="/mikrotik#enlaces" className={LINK}>
                  {t("capacity.deployment.linksEdit")}
                </a>
              </p>
            </div>
          ) : (
            <NumberField
              label={t("capacity.parent")}
              unit={t("params.unitMbps")}
              value={c.parentMbps}
              min={1}
              max={1e7}
              hint={t("capacity.parentHint")}
              onChange={(v) => v !== null && set({ parentMbps: v })}
              className="sm:max-w-xs"
            />
          )}
        </div>
        {existing && (
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-mono text-xs text-zinc-300">{t("capacity.deployment.measured")}</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                label={t("capacity.deployment.measuredDown")}
                unit={t("params.unitMbps")}
                value={c.measuredDownMbps}
                optional
                max={1e6}
                onChange={(v) => set({ measuredDownMbps: v })}
              />
              <NumberField
                label={t("capacity.deployment.measuredUp")}
                unit={t("params.unitMbps")}
                value={c.measuredUpMbps}
                optional
                max={1e6}
                onChange={(v) => set({ measuredUpMbps: v })}
              />
            </div>
            <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("capacity.deployment.measuredHint")}</p>
            {c.internet === "links" && state.wans.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">{t("capacity.deployment.measureCmd")}</span>
                {/* Scrolls sideways on phones instead of breaking the command mid-word. */}
                <code
                  tabIndex={0}
                  className="max-w-full min-w-0 overflow-x-auto rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs whitespace-nowrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {monitorCommand(state.wans.map((w) => w.iface))}
                </code>
                <CopyButton text={monitorCommand(state.wans.map((w) => w.iface))} label={t("export.copy")} done={t("export.copied")} />
              </div>
            )}
          </fieldset>
        )}
      </div>

      <div className="grid gap-5">
        <h3 className="text-sm font-medium text-foreground">{t("capacity.traffic")}</h3>
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
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {average.measured ? (
            <div className="grid content-start gap-1.5">
              <p className="font-mono text-xs text-zinc-300">{t("capacity.avg")}</p>
              <p className="flex h-10 items-center rounded-md border border-white/10 bg-white/[0.02] px-3 font-mono text-sm text-foreground tabular-nums">{fmtRate(avg)}</p>
              <p className="text-xs leading-snug text-zinc-400">{t("capacity.avgMeasured", { total: fmtRate(measured ?? 0), clients: fmtNum(total, 0) })}</p>
            </div>
          ) : (
            <NumberField
              label={t("capacity.avg")}
              unit={t("params.unitMbps")}
              value={avg}
              max={1e4}
              hint={t(down ? "capacity.avgHintDown" : "capacity.avgHintUp")}
              onChange={(v) => v !== null && set(down ? { avgDownMbps: v } : { avgUpMbps: v })}
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
        {!average.measured && measuredAverages.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs text-zinc-400">{t("capacity.borrow")}</p>
            <div className="flex flex-wrap gap-2">
              {measuredAverages.map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set({ ...(m.down !== null ? { avgDownMbps: round3(m.down) } : {}), ...(m.up !== null ? { avgUpMbps: round3(m.up) } : {}) })}
                >
                  {t("capacity.borrowOne", {
                    name: m.name.trim() || t("deployments.unnamed"),
                    down: m.down !== null ? fmtRate(m.down) : "—",
                    up: m.up !== null ? fmtRate(m.up) : "—",
                  })}
                </Button>
              ))}
            </div>
          </div>
        )}

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

      {warnings.length > 0 && (
        <div className="grid gap-2">
          {warnings.map((w) => (
            <p key={w} className="flex gap-2.5 text-sm leading-snug text-zinc-200">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
              {w}
            </p>
          ))}
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

          {r.links?.perClient && (
            <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("capacity.linksCaption")}>
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">{t("capacity.linksCaption")}</caption>
                <thead className="text-xs text-zinc-400">
                  <tr className="border-b border-white/10">
                    {(["link", "mbps", "clients", "offered", "p95", "full"] as const).map((k) => (
                      <th key={k} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                        {t(`capacity.linkCols.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono text-xs tabular-nums">
                  {r.links.each.map((l, k) => (
                    <tr key={k} className="border-t border-white/5">
                      <th scope="row" className="px-3 py-2.5 text-left font-sans text-sm font-normal whitespace-nowrap text-foreground">
                        {linkNames[k] ?? `WAN${k + 1}`}
                      </th>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtRate(l.mbps)}</td>
                      <td className="px-3 py-2.5">{fmtNum(l.clients, 0)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{`${fmtRate(l.offeredMbps)} (${fmtPct(l.offeredMbps / l.mbps)})`}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{fmtRate(l.p95Mbps)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{fmtPct(l.saturatedShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.links && !r.links.perClient && state.wans.length > 1 && (
            <p className="text-sm text-zinc-300">{t("capacity.pooled", { count: state.wans.length, cap: fmtRate(netCap) })}</p>
          )}

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
              { key: "parent", label: t("capacity.chart.parentRef", { value: rosRate(netCap) }), v: netCap, dash: "", color: "rgb(244 244 245 / 0.6)" },
              ...(r.olt && r.olt.uplinkMbps < netCap
                ? [{ key: "olt", label: t("capacity.chart.oltRef", { value: rosRate(r.olt.uplinkMbps) }), v: r.olt.uplinkMbps, dash: "8 4", color: "rgb(244 244 245 / 0.5)" }]
                : []),
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
              <p>{sizingText(fresh)}</p>
              {fresh.uplink.ok && fresh.uplink.links !== null && (
                <p className="text-zinc-300">
                  {fresh.uplink.links <= state.wans.length
                    ? t("capacity.sizing.enough", { have: state.wans.length })
                    : t("capacity.sizing.missing", { have: state.wans.length, missing: fresh.uplink.links - state.wans.length })}
                </p>
              )}
              {fresh.uplink.ok && fresh.uplink.links === null && (
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
              )}
              {(fresh.uplink.ok || fresh.uplink.limit !== "none") && (
                <p className="text-zinc-300">
                  {t("capacity.sizing.perPort", {
                    target: targetPct,
                    gpon: perPortText(fresh.perPort.gpon),
                    xgpon: perPortText(fresh.perPort.xgpon),
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
        {t("capacity.model", { gponDown: fmtRate(PON_RATES.gpon.down), gponUp: fmtRate(PON_RATES.gpon.up), xgDown: fmtRate(PON_RATES.xgpon.down), xgUp: fmtRate(PON_RATES.xgpon.up), xgs: fmtRate(PON_RATES.xgspon.down) })}
      </p>
    </div>
  )
}
