"use client"

import { useMemo, useState, type ReactNode } from "react"
import { localToday } from "@/lib/clients/from-lead"
import { AlertTriangle, Download, Plus, Save, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  checkBalance,
  CLASSIFIERS,
  detectionSeconds,
  FAILOVER_SPEEDS,
  linkSpeed,
  pccBuckets,
  WAN_TYPES,
  type LinkQueues,
  type Wan,
  type WanType,
} from "@/lib/mikrotik/balance"
import type { DeploymentStore } from "@/lib/mikrotik/deployment-store"
import { clientsOf } from "@/lib/mikrotik/deployments"
import { fmtNum } from "@/lib/mikrotik/format"
import { stepBlock } from "@/lib/mikrotik/bundle"
import { deploymentBundle, guideScripts, type GuideStepId } from "@/lib/mikrotik/guide-scripts"
import { parseScript } from "@/lib/mikrotik/ros-parse"
import { checkScript, ROS_VERSION } from "@/lib/mikrotik/ros-syntax"
import { checkSetup, CONN_LIMIT, type SetupState } from "@/lib/mikrotik/setup"
import { decodeDeployment, deploymentFields, MAX_NAME, MAX_WANS, nextMonitor, type BalanceState, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { CodeBlock } from "./CodeBlock"
import { StepList } from "./StepList"
import { IssueList } from "./IssueList"
import { NumberField } from "./NumberField"
import { PlansEditor } from "./PlansEditor"
import { AccessFields, NatFields } from "./TracePanel"
import { AdviceCard } from "./AdviceCard"
import { OpsFields } from "./OpsFields"
import { SelectField } from "./SelectField"
import { TextField } from "./TextField"

type Actions = { open: (id: string) => void; saveNew: () => void; create: (name: string) => void }
type Props = {
  state: LabState
  boundId: string | null
  saved: DeploymentStore
  actions: Actions
  onWans: (w: Wan[]) => void
  onBalance: (b: BalanceState) => void
  onSetup: (s: SetupState) => void
  onName: (name: string) => void
}

const PHASES = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"] as const
type Phase = (typeof PHASES)[number]
const TESTS = 14
const KEY = "gigafazt-mikrotik-guia"
const UNSAVED = "__sin-guardar"

/** What's ticked, per saved deployment (or "sin-guardar"), in this browser. */
function readChecks(): Record<string, string[]> {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown
    return v && typeof v === "object" ? (v as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}
function writeChecks(all: Record<string, string[]>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage blocked: the ticks last for this visit.
  }
}

/** A file name from the deployment's name. */
const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "despliegue"

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The owner's build checklist (BNG + multi-WAN PCC + CGNAT), phase by phase.
 * Each phase has the fields its commands depend on, so any deployment (open
 * one, switch, or start a new one here) gets its own scripts; the fields edit
 * the same deployment as "Varios enlaces" and "Configuración".
 */
export function GuidePanel({ state, boundId, saved, actions, onWans, onBalance, onSetup, onName }: Props) {
  const t = useTranslations("mikrotik.guide")
  const ta = useTranslations("mikrotik.advanced")
  const tl = useTranslations("mikrotik.links")
  const tc = useTranslations("mikrotik.config")
  const key = boundId ?? "sin-guardar"
  const [all, setAll] = useState(readChecks)
  const checked = new Set(all[key] ?? [])
  const toggle = (id: string, on: boolean) => {
    const next = { ...all, [key]: on ? [...checked, id] : [...checked].filter((x) => x !== id) }
    setAll(next)
    writeChecks(next)
  }

  const s = state.setup
  const b = state.balance
  const wans = state.wans
  const setS = (patch: Partial<SetupState>) => onSetup({ ...s, ...patch })
  const setB = (patch: Partial<BalanceState>) => onBalance({ ...b, ...patch })
  const setQ = (patch: Partial<LinkQueues>) => setB({ queues: { ...b.queues, ...patch } })
  const setWan = (k: number, patch: Partial<Wan>) => onWans(wans.map((w, i) => (i === k ? { ...w, ...patch } : w)))
  const addWan = () => {
    const n = wans.length + 1
    const last = wans.at(-1)
    onWans([...wans, { name: `WAN${n}`, type: last?.type ?? "dhcp", iface: `ether${n}`, gateway: "", mbps: last?.mbps ?? 1000, measuredMbps: null, upMbps: null, upstreamCgnat: false, providerNat: last?.providerNat ?? true, monitor: nextMonitor(wans), natIps: "" }])
  }

  const clients = clientsOf({ status: state.status, capacity: state.capacity })
  const g = useMemo(() => guideScripts(state), [state])
  const { ctx, parts, balance, olt } = g
  const bundle = useMemo(() => deploymentBundle(state), [state])
  // Every command of the file checked against the RouterOS reference (menus, properties, commands).
  const syntax = useMemo(() => {
    const text = bundle.steps.map((x) => x.script).join("\n")
    return { commands: parseScript(text).length, issues: checkScript(text) }
  }, [bundle])
  const { buckets, total } = pccBuckets(wans)
  const perIp = wans.length > 0 ? Math.ceil(clients / wans.length) : clients
  const issues = [
    ...checkSetup(s, ctx).map((i, k) => ({ key: `s${k}-${i.code}`, level: i.level, text: tc(`issues.${i.code}`, { value: i.value ?? "", need: fmtNum(i.need ?? 0, 0), have: fmtNum(i.have ?? 0, 0) }) })),
    ...checkBalance({ ...b, wans }).map((i, k) => ({ key: `b${k}-${i.code}`, level: i.level, context: i.wan, text: tl(`issues.${i.code}`, { value: i.value ?? "" }) })),
  ]
  const ready = parts !== null && balance !== ""
  const name = state.deployment.trim() || t("unnamed")

  // The deployment's file: the guide's steps, then the expert scripts turned on, each step with its header and checks.
  const stepTitle = (group: string, id: string) => (group === "guide" ? t(`steps.${id}.title`) : `${ta(`modules.${group}.name`)} · ${ta(`steps.${group}.${id}.title`)}`)
  const stepBefore = (group: string, id: string) => (group === "guide" ? t(`steps.${id}.before`) : ta.has(`steps.${group}.${id}.before`) ? ta(`steps.${group}.${id}.before`) : undefined)
  const routerFile = () =>
    [
      `# GigaFazt · ${name} · ${localToday()}`,
      ...(t.raw("file.header") as string[]).map((x) => `# ${x}`),
      `# ${t("file.syntax", { n: syntax.commands, version: ROS_VERSION })}`,
      "",
      ...bundle.steps.map((x, k) => stepBlock(k + 1, stepTitle(x.group, x.id), x.script, stepBefore(x.group, x.id), x.verify)),
    ].join("\n")
  const undoFile = () => [`# GigaFazt · ${name} · ${t("file.undo")}`, bundle.undo, ""].join("\n")
  const guideStep = (id: GuideStepId) => {
    const x = g.steps.find((y) => y.id === id)
    if (!x) return null
    const n = g.steps.indexOf(x)
    return (
      <div className="grid gap-2">
        <p className="font-mono text-xs text-zinc-400">{t("stepOf", { n: n + 1, total: g.steps.length })}</p>
        <StepList steps={[{ title: t(`steps.${id}.title`), before: t(`steps.${id}.before`), script: x.script, verify: x.verify }]} labels={{ step: ta("stepWord"), before: ta("before"), verify: ta("verify") }} />
      </div>
    )
  }

  const missing = <p className="text-sm text-amber-200">{t("fixAbove")}</p>
  const field = (node: ReactNode) => <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{node}</div>
  const toggleRow = (label: string, on: boolean, set: (on: boolean) => void, hint?: string) => (
    <div className="grid gap-1.5">
      <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
        <Switch checked={on} onCheckedChange={set} />
        {label}
      </label>
      {hint && <p className="max-w-3xl text-xs leading-snug text-zinc-400">{hint}</p>}
    </div>
  )
  const cell = "px-2 py-2"
  const input = "h-9 min-w-0 bg-white/[0.03] font-mono text-base md:text-sm"

  const providers = (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("upstreams.caption")}>
        <table className="w-full min-w-[68rem] text-left text-sm">
          <caption className="sr-only">{t("upstreams.caption")}</caption>
          <thead className="text-xs text-zinc-400">
            <tr className="border-b border-white/10">
              {(["link", "type", "iface", "gateway", "down", "up", "probe", "buckets", "cgnat", "remove"] as const).map((k) => (
                <th key={k} scope="col" className="px-2 py-2.5 font-normal whitespace-nowrap">
                  {k === "buckets" ? t("upstreams.cols.buckets", { total }) : t(`upstreams.cols.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wans.map((w, k) => {
              const label = (what: string) => t("upstreams.field", { what, name: w.name || `WAN${k + 1}` })
              return (
                <tr key={k} className="border-t border-white/5 align-top">
                  <td className={cell}>
                    <Input className={`${input} w-24`} value={w.name} aria-label={label(t("upstreams.cols.link"))} onChange={(e) => setWan(k, { name: e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) })} />
                  </td>
                  <td className={cell}>
                    <select
                      className="h-9 rounded-md border border-input bg-zinc-950 px-2 text-base text-foreground md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={w.type}
                      aria-label={label(t("upstreams.cols.type"))}
                      onChange={(e) => setWan(k, { type: e.target.value as WanType })}
                    >
                      {WAN_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`upstreams.types.${type}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell}>
                    <Input className={`${input} w-32`} value={w.iface} aria-label={label(t("upstreams.cols.iface"))} onChange={(e) => setWan(k, { iface: e.target.value.trim() })} />
                  </td>
                  <td className={cell}>
                    {w.type === "static" ? (
                      <Input className={`${input} w-32`} value={w.gateway} aria-label={label(t("upstreams.cols.gateway"))} onChange={(e) => setWan(k, { gateway: e.target.value.trim() })} />
                    ) : (
                      <span className="block px-1 py-2 text-xs text-zinc-500">{t(`upstreams.gatewayAuto.${w.type}`)}</span>
                    )}
                  </td>
                  <td className={cell}>
                    <Input
                      className={`${input} w-24`}
                      inputMode="decimal"
                      value={w.measuredMbps ?? ""}
                      placeholder={String(w.mbps)}
                      aria-label={label(t("upstreams.cols.down"))}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setWan(k, { measuredMbps: e.target.value.trim() === "" || !(v > 0) ? null : v })
                      }}
                    />
                  </td>
                  <td className={cell}>
                    <Input
                      className={`${input} w-24`}
                      inputMode="decimal"
                      value={w.upMbps ?? ""}
                      placeholder={String(linkSpeed(w))}
                      aria-label={label(t("upstreams.cols.up"))}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setWan(k, { upMbps: e.target.value.trim() === "" || !(v > 0) ? null : v })
                      }}
                    />
                  </td>
                  <td className={cell}>
                    <Input className={`${input} w-32`} value={w.monitor} aria-label={label(t("upstreams.cols.probe"))} onChange={(e) => setWan(k, { monitor: e.target.value.trim() })} />
                  </td>
                  <td className={`${cell} py-4 font-mono text-xs`}>{buckets[k]}</td>
                  <td className={`${cell} py-3.5`}>
                    <select
                      className="h-9 rounded-md border border-input bg-zinc-950 px-2 text-base text-foreground md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={w.upstreamCgnat ? "cgnat" : w.providerNat ? "nat" : "public"}
                      aria-label={label(t("upstreams.cols.cgnat"))}
                      onChange={(e) => setWan(k, { providerNat: e.target.value !== "public", upstreamCgnat: e.target.value === "cgnat" })}
                    >
                      {(["nat", "cgnat", "public"] as const).map((x) => (
                        <option key={x} value={x}>
                          {t(`upstreams.exits.${x}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell}>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => onWans(wans.filter((_, i) => i !== k))} disabled={wans.length <= 1} aria-label={tl("remove", { name: w.name })}>
                      <X aria-hidden />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" variant="outline" onClick={addWan} disabled={wans.length >= MAX_WANS}>
          <Plus aria-hidden />
          {tl("add")}
        </Button>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("upstreams.hint")}</p>
      </div>
    </div>
  )

  const fields: Record<Phase, ReactNode> = {
    p0: (
      <>
        {field(
          <>
            <NumberField label={tc("mgmtVlan")} unit="VLAN" value={s.mgmtVlan} integer min={2} max={4094} onChange={(v) => v !== null && setS({ mgmtVlan: v })} />
            <TextField label={tc("mgmtNet")} value={s.mgmtNet} onChange={(v) => setS({ mgmtNet: v.trim() })} hint={tc("mgmtNetHint")} />
            <TextField label={tc("oltPort")} value={s.oltPort} onChange={(v) => setS({ oltPort: v.trim() })} />
          </>
        )}
        {providers}
      </>
    ),
    p1: (
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{tl("failover")}</p>
          <Choice label={tl("failover")} value={b.failover} onChange={(failover) => setB({ failover })} options={(["recursive", "gateway"] as const).map((f) => ({ value: f, label: tl(`failovers.${f}`) }))} className="sm:w-full" />
        </div>
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{tl("detect")}</p>
          <Choice label={tl("detect")} value={b.speed} onChange={(speed) => setB({ speed })} options={FAILOVER_SPEEDS.map((x) => ({ value: x, label: tl(`detects.${x}`, { s: detectionSeconds(x) }) }))} className="sm:w-full" />
        </div>
        {toggleRow(tl("queues.alerts"), b.queues.alerts, (alerts) => setQ({ alerts }))}
        {toggleRow(tl("queues.flush"), b.queues.flush, (flush) => setQ({ flush }))}
      </div>
    ),
    p2: (
      <div className="grid gap-2">
        <p className="font-mono text-xs text-zinc-300">{tl("classifier")}</p>
        <Choice label={tl("classifier")} value={b.classifier} onChange={(classifier) => setB({ classifier })} options={CLASSIFIERS.map((x) => ({ value: x, label: tl(`classifiers.${x}`) }))} className="sm:w-full" />
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{tl(`classifierHint.${b.classifier}`)}</p>
      </div>
    ),
    p3: (
      <>
        {field(
          <>
            <TextField label={tc("pool")} value={s.pool} onChange={(v) => setS({ pool: v.trim() })} />
            <TextField label={tc("collector")} value={s.collector} onChange={(v) => setS({ collector: v.trim() })} hint={tc("collectorHint")} />
          </>
        )}
        {toggleRow(tc("isolate"), s.isolate, (isolate) => setS({ isolate }), tc("isolateHint"))}
        <NatFields setup={s} wans={wans} onSetup={setS} onWans={onWans} where={tc("trace.whereGuide")} />
      </>
    ),
    p4: (
      <>
        {field(
          <>
            <NumberField label={tc("internetVlan")} unit="VLAN" value={s.internetVlan} integer min={2} max={4094} onChange={(v) => v !== null && setS({ internetVlan: v })} />
            <TextField label={tc("service")} value={s.service} onChange={(v) => setS({ service: v.trim() })} />
            <TextField label={tc("dns")} value={s.dns} onChange={(v) => setS({ dns: v })} hint={tc("dnsHint")} />
            <TextField label={tc("oltUplink")} value={s.oltUplink} onChange={(v) => setS({ oltUplink: v.trim() })} hint={tc("oltUplinkHint")} />
            <SelectField label={tc("ontMode")} value={s.ontMode} onChange={(v) => setS({ ontMode: v === "router" ? "router" : "bridge" })}>
              <option value="router">{tc("ontModes.router")}</option>
              <option value="bridge">{tc("ontModes.bridge")}</option>
            </SelectField>
          </>
        )}
        {toggleRow(tc("mtu1500"), s.mtu1500, (mtu1500) => setS({ mtu1500 }))}
        <AccessFields setup={s} onSetup={setS} />
        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium text-foreground">{tc("plans.title")}</p>
          <PlansEditor plans={s.plans} rule={s.rule} onPlans={(p) => setS({ plans: p })} onRule={(rule) => setS({ rule })} label={tc("plans.captionGuide")} />
        </div>
      </>
    ),
    p5: (
      <>
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_14rem]">
          {toggleRow(tl("queues.shape"), b.queues.shape, (shape) => setQ({ shape }))}
          {b.queues.shape && <NumberField label={tl("queues.share")} unit="%" value={b.queues.sharePct} min={50} max={100} onChange={(v) => v !== null && setQ({ sharePct: v })} />}
        </div>
        {toggleRow(tc("firewall"), s.firewall, (firewall) => setS({ firewall }))}
        {toggleRow(tc("blockSmtp"), s.blockSmtp, (blockSmtp) => setS({ blockSmtp }))}
        <OpsFields setup={s} onSetup={setS} />
      </>
    ),
    p6: null,
  }

  const scripts: Record<Phase, ReactNode> = {
    p0: (
      <>
        <CodeBlock label={t("scripts.backup")} code={"/export file=fabrica\n/system backup save name=fabrica"} />
        {parts ? guideStep("base") : missing}
      </>
    ),
    p1: balance && parts ? guideStep("balance") : missing,
    p2: <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("sameScript")}</p>,
    p3: (
      <>
        <p className="flex gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 text-sm leading-relaxed text-zinc-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <span>{t("forwardBug")}</span>
        </p>
        {parts && balance ? guideStep("cgnat") : missing}
        {!s.collector.trim() && <p className="text-sm text-amber-200">{t(s.natMode === "fixed" ? "noCollectorFixed" : "noCollector")}</p>}
      </>
    ),
    p4: (
      <>
        {parts && balance ? guideStep("pppoe") : missing}
        <CodeBlock label={t("scripts.radius")} code={"/radius add service=ppp address=<IP-RADIUS> secret=<SECRETO>\n/ppp aaa set use-radius=yes accounting=yes interim-update=5m"} />
        <p className="max-w-3xl text-sm leading-relaxed text-amber-200">{t("oltWarning")}</p>
        {olt ? <CodeBlock label={t("scripts.olt")} code={olt} /> : missing}
        <p className="text-sm text-zinc-300">
          {t("ontPointer")}{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
          <a href="/interno/routers/scripts-mikrotik#configuracion" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("where.setup")}
          </a>
        </p>
      </>
    ),
    p5: parts && balance ? (
      <>
        {guideStep("hardening")}
        {guideStep("ops")}
      </>
    ) : (
      missing
    ),
    p6: (
      <>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("tests.caption")}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{t("tests.caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {(["done", "test", "pass"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal">
                    {t(`tests.cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TESTS }, (_, k) => {
                const id = `t${k + 1}`
                return (
                  <tr key={id} className="border-t border-white/5 align-top">
                    <td className="px-3 py-2.5">
                      <Checkbox checked={checked.has(id)} onCheckedChange={(on) => toggle(id, on === true)} aria-label={t("tests.doneOne", { n: k + 1 })} />
                    </td>
                    <td className="px-3 py-2.5 text-zinc-100">{t(`tests.rows.${id}.test`)}</td>
                    <td className="px-3 py-2.5 text-zinc-400">{t(`tests.rows.${id}.pass`)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <CodeBlock label={t("scripts.export")} code={"/export file=produccion-v1\n/system backup save name=produccion-v1"} />
      </>
    ),
  }

  const options = saved.list.flatMap((d) => {
    const f = decodeDeployment(d.data)
    return f ? [{ id: d.id, name: f.deployment.trim() || t("unnamed") }] : []
  })

  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      {/* Which deployment the scripts are for: switch, start a new one, save, download everything. */}
      <div className="surface grid gap-5 rounded-2xl p-5 sm:p-6">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <SelectField label={t("deploy.pick")} value={boundId ?? UNSAVED} onChange={(id) => id !== UNSAVED && actions.open(id)} hint={t("deploy.pickHint")}>
            {!boundId && <option value={UNSAVED}>{t("deploy.unsaved")}</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </SelectField>
          <TextField label={t("deploy.name")} value={state.deployment} onChange={(v) => onName(v.slice(0, MAX_NAME))} />
          <div className="flex flex-wrap gap-2 pb-0.5">
            {!boundId && (
              <Button type="button" onClick={actions.saveNew}>
                <Save aria-hidden />
                {t("deploy.save")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => actions.create(t("deploy.newName", { n: saved.list.length + 1 }))}>
              <Plus aria-hidden />
              {t("deploy.new")}
            </Button>
          </div>
        </div>
        <IssueList items={issues} />
        <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-foreground">{t("bundle.title", { n: bundle.steps.length })}</p>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">
            {bundle.steps.some((x) => x.group !== "guide")
              ? t("bundle.with", { list: [...new Set(bundle.steps.filter((x) => x.group !== "guide").map((x) => ta(`modules.${x.group}.name`)))].join(", ") })
              : t("bundle.none")}{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
            <a href="/interno/routers/scripts-mikrotik#avanzados" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {t("bundle.link")}
            </a>
          </p>
          {bundle.skipped.length > 0 && <p className="text-xs text-amber-200">{t("bundle.skipped", { list: bundle.skipped.map((m) => ta(`modules.${m}.name`)).join(", ") })}</p>}
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("bundle.howTo")}</p>
          {bundle.steps.length > 0 &&
            (syntax.issues.length === 0 ? (
              <p className="text-xs text-emerald-300">{t("bundle.syntaxOk", { n: syntax.commands, version: ROS_VERSION })}</p>
            ) : (
              <p className="text-xs text-red-300">{t("bundle.syntaxBad", { version: ROS_VERSION, list: syntax.issues.slice(0, 5).map((i) => `${i.menu} ${i.verb} ${i.item}`.trim()).join(" · ") })}</p>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={!ready} onClick={() => download(`${slug(state.deployment)}-mikrotik.rsc`, routerFile())}>
            <Download aria-hidden />
            {t("deploy.downloadRouter")}
          </Button>
          <Button type="button" variant="outline" disabled={!ready} onClick={() => download(`${slug(state.deployment)}-deshacer.rsc`, undoFile())}>
            <Download aria-hidden />
            {t("deploy.downloadUndo")}
          </Button>
          <Button type="button" variant="outline" disabled={!olt} onClick={() => download(`${slug(state.deployment)}-olt-huawei.txt`, `${olt}\n`)}>
            <Download aria-hidden />
            {t("deploy.downloadOlt")}
          </Button>
          <p className="max-w-xl text-xs leading-snug text-zinc-400">{ready ? t("deploy.downloadHint") : t("fixAbove")}</p>
        </div>
      </div>

      <AdviceCard fields={deploymentFields(state)} name={name} />

      {PHASES.map((ph, n) => {
        const items = t.raw(`phases.${ph}.items`) as string[]
        const ids = items.map((_, k) => `${ph}-${k}`)
        const done = ids.filter((id) => checked.has(id)).length
        return (
          <details key={ph} className="surface rounded-2xl" open={n === 0}>
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6">
              <span className="text-base font-medium text-foreground">{t(`phases.${ph}.title`)}</span>
              <span className="font-mono text-xs text-zinc-400">{t("progress", { done, total: ids.length })}</span>
            </summary>
            <div className="grid min-w-0 gap-5 px-5 pb-6 sm:px-6 [&>*]:min-w-0">
              <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t(`phases.${ph}.goal`)}</p>
              <ul className="grid gap-2.5">
                {items.map((item, k) => (
                  <li key={k}>
                    <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-zinc-200">
                      <Checkbox className="mt-0.5" checked={checked.has(ids[k])} onCheckedChange={(on) => toggle(ids[k], on === true)} />
                      <span className={checked.has(ids[k]) ? "text-zinc-500 line-through" : undefined}>
                        {item.replace("{perIp}", fmtNum(perIp, 0)).replace("{limit}", fmtNum(CONN_LIMIT, 0))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {fields[ph] && (
                <fieldset className="grid min-w-0 gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 [&>*]:min-w-0">
                  <legend className="px-1 text-sm font-medium text-foreground">{t("dataFor", { name })}</legend>
                  {fields[ph]}
                </fieldset>
              )}
              {scripts[ph]}
            </div>
          </details>
        )
      })}
      <div className="surface grid gap-2 rounded-2xl p-5 sm:p-6">
        <h3 className="text-sm font-medium text-foreground">{t("hardware.title")}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("hardware.body")}</p>
      </div>
    </div>
  )
}
