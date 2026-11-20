"use client"

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  BTH_NET,
  backupRouterScripts,
  bgpScript,
  boostScript,
  boostedPlans,
  clientCommands,
  dnsFilterScript,
  familyName,
  monitorScript,
  morososScript,
  remoteScript,
  routeScript,
  shieldScript,
  upgradeCommands,
  usageScript,
  type AdvContext,
  type AdvIssue,
  type BackupRouterOptions,
  type BgpOptions,
  type BoostOptions,
  type ClientAction,
  type DnsFilterOptions,
  type MonitorOptions,
  type MorososOptions,
  type RemoteOptions,
  type ShieldOptions,
  type Step,
  type UsageOptions,
} from "@/lib/mikrotik/advanced"
import {
  alertsScript,
  bondScript,
  exportInterfaces,
  failoverScript,
  filtersScript,
  fullExportScript,
  priorityScript,
  profileSyncScripts,
  publicIpScript,
  remapExport,
  type AlertsOptions,
  type FailoverOptions,
  type FilterOptions,
  type PublicIpRow,
} from "@/lib/mikrotik/advanced2"
import {
  conntrackScript,
  poolScript,
  portsScript,
  sessionsScript,
  sheetCommand,
  sheetScript,
  type ConntrackOptions,
  type PoolOptions,
  type PortsOptions,
  type SessionsOptions,
} from "@/lib/mikrotik/advanced3"
import { GROUPS, optionsOf, type BondPanelOptions, type DestinationsOptions, type Module, type PublicIpOptions } from "@/lib/mikrotik/bundle"
import { advContext } from "@/lib/mikrotik/guide-scripts"
import { setupPlans } from "@/lib/mikrotik/setup"
import type { AdvancedState, LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { CodeBlock } from "./CodeBlock"
import { IssueList } from "./IssueList"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { StepList } from "./StepList"
import { TextField } from "./TextField"

type T = ReturnType<typeof useTranslations>

/** The deployment's saved generator settings, for every generator below. */
type Opts = { ctx: AdvContext; adv: AdvancedState; onAdvanced: (a: AdvancedState) => void }
const OptsContext = createContext<Opts | null>(null)

/** A generator's settings (saved with the deployment) and their setter. */
function useOpts<O extends object>(mod: Module): [O, (o: O) => void] {
  const c = useContext(OptsContext) as Opts
  const o = optionsOf<O>(mod, c.ctx, c.adv)
  return [o, (next: O) => c.onAdvanced({ ...c.adv, o: { ...c.adv.o, [mod]: next as Record<string, unknown> } })]
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="grid gap-1">
      <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
        <Switch checked={on} onCheckedChange={set} />
        {label}
      </label>
      {hint && <p className="max-w-3xl text-xs leading-snug text-zinc-400">{hint}</p>}
    </div>
  )
}

function Area({ label, hint, value, set, rows = 4, placeholder }: { label: string; hint?: string; value: string; set: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} rows={rows} spellCheck={false} autoComplete="off" placeholder={placeholder} aria-describedby={hint ? `${id}-hint` : undefined} className="max-h-96 overflow-y-auto font-mono text-base md:text-xs" />
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}

const grid = "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"

/** Step titles and checks from the messages: advanced.steps.<module>.<id>.{title, before}. */
export function shownSteps(t: T, mod: string, steps: Step[]) {
  return steps.map((s) => ({
    title: t(`steps.${mod}.${s.id}.title`),
    before: t.has(`steps.${mod}.${s.id}.before`) ? t(`steps.${mod}.${s.id}.before`) : undefined,
    script: s.script,
    verify: s.verify,
  }))
}

/** Issues, the script as steps and its undo. */
function Output({ t, mod, issues, steps, undo, label, extra, before }: { t: T; mod: string; issues: AdvIssue[]; steps: Step[]; undo: string; label: string; extra?: ReactNode; before?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4">
      <IssueList items={issues.map((i, k) => ({ key: `${i.code}-${k}`, level: i.level, text: t(`issues.${i.code}`, { value: i.value ?? "" }) }))} />
      {before}
      {steps.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <StepList steps={shownSteps(t, mod, steps)} labels={{ step: t("stepWord"), before: t("before"), verify: t("verify") }} />
        </div>
      )}
      {extra}
      {undo && (
        <details className="rounded-xl border border-white/10">
          <summary className="cursor-pointer rounded-xl p-3 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("undo")}</summary>
          <div className="px-3 pb-3">
            <CodeBlock code={undo} label={t("undoLabel", { label })} />
          </div>
        </details>
      )}
    </div>
  )
}

/** Expert scripts for the open deployment: settings saved with it, each as steps with its undo (owner, 2026-11-16). */
export function AdvancedPanel({ state, onAdvanced }: { state: LabState; onAdvanced: (a: AdvancedState) => void }) {
  const t = useTranslations("mikrotik.advanced")
  const [mod, setMod] = useState<Module>("failover")
  const ctx: AdvContext = advContext(state)
  const adv = state.advanced
  const planNames = useMemo(() => setupPlans(state.setup.plans, state.setup.rule).map((p) => p.name), [state.setup.plans, state.setup.rule])
  const included = adv.on.includes(mod)
  const include = (on: boolean) => onAdvanced({ ...adv, on: on ? [...adv.on.filter((m) => m !== mod), mod] : adv.on.filter((m) => m !== mod) })

  return (
    <OptsContext.Provider value={{ ctx, adv, onAdvanced }}>
      <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
        <div className="grid gap-2 sm:max-w-md">
          <SelectField label={t("pick")} value={mod} onChange={(v) => setMod(v as Module)}>
            {Object.entries(GROUPS).map(([g, mods]) => (
              <optgroup key={g} label={t(`groups.${g}`)}>
                {mods.map((m) => (
                  <option key={m} value={m}>
                    {t(`modules.${m}.name`)}
                    {adv.on.includes(m) ? ` ✓` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        </div>
        <details className="rounded-xl border border-white/10">
          <summary className="cursor-pointer rounded-xl p-3 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("order.title")}</summary>
          <ol className="grid gap-1.5 px-3 pb-3 text-sm leading-relaxed text-zinc-300">
            {(t.raw("order.steps") as string[]).map((x, k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden className="font-mono text-xs text-zinc-400">
                  {String(k + 1).padStart(2, "0")}
                </span>
                {x}
              </li>
            ))}
          </ol>
        </details>
        <div className="grid gap-1.5">
          <h3 className="text-base font-medium text-foreground">{t(`modules.${mod}.name`)}</h3>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t(`modules.${mod}.lead`)}</p>
        </div>
        <div className="grid gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <Toggle label={t("include", { name: state.deployment.trim() || t("thisDeployment") })} on={included} set={include} />
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">
            {t("includeHint")}{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
            <a href="/interno/routers/guia-mikrotik#guia" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {t("includeLink")}
            </a>
          </p>
        </div>
        {mod === "morosos" && <Morosos t={t} ctx={ctx} plans={planNames} />}
        {mod === "acceso" && <Remote t={t} ctx={ctx} />}
        {mod === "dns" && <DnsFilter t={t} ctx={ctx} plans={planNames} />}
        {mod === "uso" && <Usage t={t} ctx={ctx} />}
        {mod === "escudo" && <Shield t={t} ctx={ctx} />}
        {mod === "velocidad" && <Speeds t={t} ctx={ctx} plans={planNames} />}
        {mod === "monitoreo" && <Monitor t={t} ctx={ctx} />}
        {mod === "respaldo" && <BackupRouter t={t} ctx={ctx} />}
        {mod === "destinos" && <Destinations t={t} ctx={ctx} />}
        {mod === "bgp" && <Bgp t={t} />}
        {mod === "failover" && <Failover t={t} ctx={ctx} />}
        {mod === "bond" && <Bond t={t} ctx={ctx} />}
        {mod === "repuesto" && <Spare t={t} ctx={ctx} />}
        {mod === "filtros" && <Filters t={t} ctx={ctx} />}
        {mod === "alertas" && <Alerts t={t} ctx={ctx} />}
        {mod === "ficha" && <Sheet t={t} ctx={ctx} />}
        {mod === "sesiones" && <Sessions t={t} ctx={ctx} />}
        {mod === "pool" && <Pool t={t} ctx={ctx} />}
        {mod === "conexiones" && <Conntrack t={t} ctx={ctx} />}
        {mod === "puertos" && <Ports t={t} ctx={ctx} />}
        {mod === "prioridad" && <Priority t={t} ctx={ctx} />}
        {mod === "ippublica" && <PublicIps t={t} ctx={ctx} />}
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
      </div>
    </OptsContext.Provider>
  )
}

function Morosos({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useOpts<MorososOptions>("morosos")
  const [action, setAction] = useState<ClientAction>("suspend")
  const [clients, setClients] = useState("")
  const r = morososScript(ctx, o)
  const cmd = clientCommands(action, clients, plans)
  return (
    <>
      <div className={grid}>
        <TextField label={t("morosos.url")} value={o.noticeUrl} onChange={(v) => setO({ ...o, noticeUrl: v.trim() })} hint={t("morosos.urlHint")} />
        <TextField label={t("morosos.allow")} value={o.allow} onChange={(v) => setO({ ...o, allow: v })} hint={t("morosos.allowHint")} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t("morosos.down")} unit="Mbps" value={o.reducedDown} max={1000} onChange={(v) => v !== null && setO({ ...o, reducedDown: v })} />
          <NumberField label={t("morosos.up")} unit="Mbps" value={o.reducedUp} max={1000} onChange={(v) => v !== null && setO({ ...o, reducedUp: v })} />
        </div>
      </div>
      <Output t={t} mod="morosos" issues={r.issues} steps={r.steps} undo={r.undo} label={t("morosos.label")} />
      <div className="grid gap-3 rounded-xl border border-white/10 p-4">
        <h4 className="text-sm font-medium text-foreground">{t("morosos.clients")}</h4>
        <Choice label={t("morosos.action")} value={action} onChange={setAction} options={(["reduce", "suspend", "restore"] as const).map((k) => ({ value: k, label: t(`morosos.actions.${k}`) }))} />
        <Area label={t("morosos.list")} hint={t("morosos.listHint", { plans: plans.join(", ") })} value={clients} set={setClients} placeholder={"juan.perez\nmaria.lopez,plan-500M"} />
        <IssueList items={cmd.errors.map((e, k) => ({ key: `e${k}`, level: "error", text: t(`issues.${e.code}`, { value: e.value ?? "", line: e.line }) }))} />
        {cmd.script && <CodeBlock code={cmd.script} label={t(`morosos.actions.${action}`)} />}
      </div>
    </>
  )
}

function Remote({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<RemoteOptions>("acceso")
  const r = remoteScript(ctx, o)
  return (
    <>
      <Choice label={t("acceso.mode")} value={o.mode} onChange={(mode) => setO({ ...o, mode })} options={(["bth", "hub"] as const).map((k) => ({ value: k, label: t(`acceso.modes.${k}`) }))} />
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t(`acceso.modeHint.${o.mode}`, { net: BTH_NET })}</p>
      {o.mode === "bth" ? (
        <div className={grid}>
          <TextField label={t("acceso.users")} value={o.users} onChange={(v) => setO({ ...o, users: v })} hint={t("acceso.usersHint")} />
        </div>
      ) : (
        <div className={grid}>
          <TextField label={t("acceso.hub")} value={o.hub} onChange={(v) => setO({ ...o, hub: v.trim() })} hint={t("acceso.hubHint")} />
          <NumberField label={t("acceso.port")} unit="UDP" value={o.hubPort} integer min={1} max={65535} onChange={(v) => v !== null && setO({ ...o, hubPort: v })} />
          <TextField label={t("acceso.tunnel")} value={o.tunnel} onChange={(v) => setO({ ...o, tunnel: v.trim() })} />
          <NumberField label={t("acceso.host")} unit="#" value={o.host} integer min={2} max={65000} onChange={(v) => v !== null && setO({ ...o, host: v })} hint={t("acceso.hostHint")} />
        </div>
      )}
      <Output t={t} mod="acceso" issues={r.issues} steps={r.steps} undo={r.undo} label={t("acceso.label")} extra={r.hubSide ? <CodeBlock code={r.hubSide} label={t("acceso.hubSide")} /> : undefined} />
    </>
  )
}

function DnsFilter({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useOpts<DnsFilterOptions>("dns")
  const r = dnsFilterScript(ctx, o)
  return (
    <>
      <div className="grid gap-3">
        {(["ads", "adult", "force", "family"] as const).map((k) => (
          <Toggle key={k} label={t(`dns.${k}`)} hint={t(`dns.${k}Hint`, { plans: plans.map(familyName).join(", ") })} on={o[k]} set={(v) => setO({ ...o, [k]: v })} />
        ))}
      </div>
      <Output t={t} mod="dns" issues={r.issues} steps={r.steps} undo={r.undo} label={t("dns.label")} />
    </>
  )
}

function Usage({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<UsageOptions>("uso")
  const r = usageScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("uso.cap")} unit="GB" value={o.capGb} max={100000} onChange={(v) => v !== null && setO({ ...o, capGb: v })} hint={t("uso.capHint")} />
        <NumberField label={t("uso.top")} unit="#" value={o.top} integer max={20} onChange={(v) => v !== null && setO({ ...o, top: v })} hint={t("uso.topHint")} />
        <TextField label={t("uso.time")} value={o.reportTime} onChange={(v) => setO({ ...o, reportTime: v.trim() })} />
      </div>
      <Output t={t} mod="uso" issues={r.issues} steps={r.steps} undo={r.undo} label={t("uso.label")} />
    </>
  )
}

function Shield({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<ShieldOptions>("escudo")
  const r = shieldScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("escudo.rate")} unit={t("escudo.rateUnit")} value={o.rate} integer min={20} max={5000} onChange={(v) => v !== null && setO({ ...o, rate: v })} hint={t("escudo.rateHint")} />
      </div>
      <div className="grid gap-3">
        {(["scan", "block", "inbound"] as const).map((k) => (
          <Toggle key={k} label={t(`escudo.${k}`)} hint={t(`escudo.${k}Hint`)} on={o[k]} set={(v) => setO({ ...o, [k]: v })} />
        ))}
      </div>
      <Output t={t} mod="escudo" issues={r.issues} steps={r.steps} undo={r.undo} label={t("escudo.label")} />
    </>
  )
}

function Speeds({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useOpts<BoostOptions>("velocidad")
  const r = boostScript(ctx, o)
  const rows = boostedPlans(ctx.setup.plans, ctx.setup.rule, o)
  const [u, setU] = useState({ user: "", to: plans.at(-1) ?? "", back: plans[0] ?? "", date: "", time: "00:00:00" })
  const up = upgradeCommands(u, plans)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("velocidad.factor")} unit="×" value={o.factor} max={10} onChange={(v) => v !== null && setO({ ...o, factor: v })} />
        <TextField label={t("velocidad.start")} value={o.start} onChange={(v) => setO({ ...o, start: v.trim() })} />
        <TextField label={t("velocidad.end")} value={o.end} onChange={(v) => setO({ ...o, end: v.trim() })} />
        <NumberField label={t("velocidad.cap")} unit="Mbps" value={o.capMbps} max={100000} onChange={(v) => v !== null && setO({ ...o, capMbps: v })} hint={t("velocidad.capHint")} />
      </div>
      <Toggle label={t("velocidad.reconnect")} hint={t("velocidad.reconnectHint")} on={o.reconnect} set={(v) => setO({ ...o, reconnect: v })} />
      {rows.length > 0 && (
        <ul className="grid gap-1 text-sm text-zinc-300">
          {rows.map((p) => (
            <li key={p.name}>{t("velocidad.row", { plan: p.name, down: p.down, up: p.up })}</li>
          ))}
        </ul>
      )}
      <Output t={t} mod="velocidad" issues={r.issues} steps={r.steps} undo={r.undo} label={t("velocidad.label")} />
      <div className="grid gap-3 rounded-xl border border-white/10 p-4">
        <h4 className="text-sm font-medium text-foreground">{t("velocidad.upgrade")}</h4>
        <div className={grid}>
          <TextField label={t("velocidad.user")} value={u.user} onChange={(v) => setU({ ...u, user: v.trim() })} />
          <SelectField label={t("velocidad.to")} value={u.to} onChange={(v) => setU({ ...u, to: v })}>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <SelectField label={t("velocidad.back")} value={u.back} onChange={(v) => setU({ ...u, back: v })}>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <TextField label={t("velocidad.date")} value={u.date} onChange={(v) => setU({ ...u, date: v.trim() })} hint={t("velocidad.dateHint")} />
          <TextField label={t("velocidad.time")} value={u.time} onChange={(v) => setU({ ...u, time: v.trim() })} />
        </div>
        {u.user && <IssueList items={up.issues.map((i, k) => ({ key: `u${k}`, level: i.level, text: t(`issues.${i.code}`, { value: i.value ?? "" }) }))} />}
        {up.script && <CodeBlock code={up.script} label={t("velocidad.upgrade")} />}
      </div>
    </>
  )
}

function Monitor({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<MonitorOptions>("monitoreo")
  const r = monitorScript(ctx, o)
  return (
    <>
      <div className="grid gap-3">
        <Toggle label={t("monitoreo.graphs")} hint={t("monitoreo.graphsHint")} on={o.graphs} set={(v) => setO({ ...o, graphs: v })} />
        <Toggle label={t("monitoreo.watchdog")} hint={t("monitoreo.watchdogHint")} on={o.watchdog} set={(v) => setO({ ...o, watchdog: v })} />
      </div>
      <div className={grid}>
        <NumberField label={t("monitoreo.drop")} unit={t("monitoreo.dropUnit")} value={o.dropAlert} integer max={10000} onChange={(v) => v !== null && setO({ ...o, dropAlert: v })} hint={t("monitoreo.dropHint")} />
        <NumberField label={t("monitoreo.dropPct")} unit="%" value={o.dropPct} integer max={100} onChange={(v) => v !== null && setO({ ...o, dropPct: v })} />
        <TextField label={t("monitoreo.summary")} value={o.summaryTime} onChange={(v) => setO({ ...o, summaryTime: v.trim() })} hint={t("monitoreo.summaryHint")} />
      </div>
      <Output t={t} mod="monitoreo" issues={r.issues} steps={r.steps} undo={r.undo} label={t("monitoreo.label")} />
    </>
  )
}

function BackupRouter({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<BackupRouterOptions>("respaldo")
  const r = backupRouterScripts(ctx, o)
  const sync = r.backupIp ? profileSyncScripts(o.syncUser, r.backupIp) : null
  const mainSteps = sync ? [...r.mainSteps, { id: "velocidades", script: sync.main }] : r.mainSteps
  const backupSteps = sync ? [...r.backupSteps, { id: "velocidades", script: sync.backup }] : r.backupSteps
  return (
    <>
      <div className={grid}>
        <NumberField label={t("respaldo.vrid")} unit="VRID" value={o.vrid} integer min={1} max={255} onChange={(v) => v !== null && setO({ ...o, vrid: v })} />
        <NumberField label={t("respaldo.pado")} unit="ms" value={o.padoDelay} integer min={100} max={5000} onChange={(v) => v !== null && setO({ ...o, padoDelay: v })} hint={t("respaldo.padoHint")} />
        <TextField label={t("respaldo.user")} value={o.syncUser} onChange={(v) => setO({ ...o, syncUser: v.trim() })} />
        <TextField label={t("respaldo.oltPort2")} value={o.oltPort2} onChange={(v) => setO({ ...o, oltPort2: v.trim() })} hint={t("respaldo.oltPort2Hint")} />
      </div>
      <Output
        t={t}
        mod="respaldo"
        issues={r.issues}
        steps={mainSteps}
        undo={r.undoMain}
        label={t("respaldo.main")}
        before={r.olt ? <CodeBlock code={r.olt} label={t("respaldo.olt")} /> : undefined}
        extra={
          backupSteps.length ? (
            <div className="grid gap-3">
              <p className="text-sm font-medium text-foreground">{t("respaldo.backup")}</p>
              <StepList steps={shownSteps(t, "respaldoB", backupSteps)} labels={{ step: t("stepWord"), before: t("before"), verify: t("verify") }} />
            </div>
          ) : undefined
        }
      />
    </>
  )
}

function Destinations({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<DestinationsOptions>("destinos")
  const rules = o.rules
  const r = routeScript(ctx, rules)
  const wan = ctx.wans[0]?.name ?? ""
  const set = (k: number, patch: Partial<DestinationsOptions["rules"][number]>) => setO({ rules: rules.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
  return (
    <>
      {rules.map((rule, k) => (
        <div key={k} className="grid items-start gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <SelectField label={t("destinos.wan", { n: k + 1 })} value={rule.wan} onChange={(v) => set(k, { wan: v })}>
            {ctx.wans.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </SelectField>
          <TextField label={t("destinos.dest", { n: k + 1 })} value={rule.dest} onChange={(v) => set(k, { dest: v })} hint={k === 0 ? t("destinos.destHint") : undefined} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setO({ rules: [...rules, { wan, dest: "" }] })} disabled={rules.length >= 8}>
          {t("destinos.add")}
        </button>
        {rules.length > 1 && (
          <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setO({ rules: rules.slice(0, -1) })}>
            {t("destinos.remove")}
          </button>
        )}
      </div>
      <Output t={t} mod="destinos" issues={r.issues} steps={r.steps} undo={r.undo} label={t("destinos.label")} />
    </>
  )
}

function Bgp({ t }: { t: T }) {
  const [o, setO] = useOpts<BgpOptions>("bgp")
  const r = bgpScript(o)
  return (
    <>
      <ul className="grid max-w-3xl gap-1.5 text-sm leading-relaxed text-zinc-300">
        {(t.raw("bgp.steps") as string[]).map((x, k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden className="font-mono text-xs text-zinc-400">
              {String(k + 1).padStart(2, "0")}
            </span>
            {x}
          </li>
        ))}
      </ul>
      <div className={grid}>
        <NumberField label={t("bgp.asn")} unit="AS" value={o.asn || null} integer optional min={1} max={4294967295} onChange={(v) => setO({ ...o, asn: v ?? 0 })} />
        <TextField label={t("bgp.routerId")} value={o.routerId} onChange={(v) => setO({ ...o, routerId: v.trim() })} hint={t("bgp.routerIdHint")} />
        <TextField label={t("bgp.prefixes")} value={o.prefixes} onChange={(v) => setO({ ...o, prefixes: v })} hint={t("bgp.prefixesHint")} />
      </div>
      <Area label={t("bgp.peers")} hint={t("bgp.peersHint")} value={o.peers} set={(v) => setO({ ...o, peers: v })} placeholder={"carrier1,198.51.100.1,65010,0\ncarrier2,203.0.113.5,65020,2"} />
      <Output t={t} mod="bgp" issues={r.issues} steps={r.steps} undo={r.undo} label={t("bgp.label")} />
    </>
  )
}

function Failover({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<FailoverOptions>("failover")
  const r = failoverScript(ctx, o)
  return (
    <>
      <div className={grid}>
        {ctx.wans.map((w) => (
          <TextField key={w.name} label={t("failover.probe", { wan: w.name })} value={o.probes[w.name] ?? ""} onChange={(v) => setO({ ...o, probes: { ...o.probes, [w.name]: v.trim() } })} hint={t("failover.probeHint", { monitor: w.monitor })} />
        ))}
      </div>
      <div className={grid}>
        <NumberField label={t("failover.loss")} unit="%" value={o.lossPct} integer min={1} max={100} onChange={(v) => v !== null && setO({ ...o, lossPct: v })} hint={t("failover.lossHint")} />
        <NumberField label={t("failover.avg")} unit="ms" value={o.avgMs} integer min={10} max={2000} onChange={(v) => v !== null && setO({ ...o, avgMs: v })} hint={t("failover.avgHint")} />
        <NumberField label={t("failover.hold")} unit="min" value={o.holdMin} max={60} onChange={(v) => v !== null && setO({ ...o, holdMin: v })} hint={t("failover.holdHint")} />
      </div>
      <div className={grid}>
        <TextField label={t("failover.lte")} value={o.lte} onChange={(v) => setO({ ...o, lte: v.trim() })} hint={t("failover.lteHint")} />
        {o.lte && <NumberField label={t("failover.lteMbps")} unit="Mbps" value={o.lteMbps} max={1000} onChange={(v) => v !== null && setO({ ...o, lteMbps: v })} />}
      </div>
      <Output t={t} mod="failover" issues={r.issues} steps={r.steps} undo={r.undo} label={t("failover.label")} />
    </>
  )
}

function Bond({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<BondPanelOptions>("bond")
  const r = bondScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <TextField label={t("bond.ports")} value={o.ports} onChange={(v) => setO({ ...o, ports: v })} hint={t("bond.portsHint", { port: ctx.setup.oltPort })} />
        <TextField label={t("bond.oltPorts")} value={o.oltPorts} onChange={(v) => setO({ ...o, oltPorts: v })} hint={t("bond.oltPortsHint")} />
      </div>
      <Output t={t} mod="bond" issues={r.issues} steps={r.steps} undo={r.undo} label={t("bond.router")} before={r.olt ? <CodeBlock code={r.olt} label={t("bond.olt")} /> : undefined} />
    </>
  )
}

function Spare({ t, ctx }: { t: T; ctx: AdvContext }) {
  // The pasted export carries passwords: kept only on this page, never saved.
  const [text, setText] = useState("")
  const [map, setMap] = useState<Record<string, string>>({})
  const found = useMemo(() => exportInterfaces(text), [text])
  const out = text.trim() ? remapExport(text, map) : ""
  const full = fullExportScript(ctx)
  return (
    <>
      <ol className="grid max-w-3xl gap-1.5 text-sm leading-relaxed text-zinc-300">
        {(t.raw("repuesto.steps") as string[]).map((x, k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden className="font-mono text-xs text-zinc-400">
              {String(k + 1).padStart(2, "0")}
            </span>
            {x}
          </li>
        ))}
      </ol>
      <Area label={t("repuesto.paste")} hint={t("repuesto.pasteHint")} value={text} set={setText} rows={8} />
      {found.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium text-foreground">{t("repuesto.map")}</legend>
          <div className={grid}>
            {found.map((i) => (
              <TextField key={i} label={t("repuesto.to", { from: i })} value={map[i] ?? ""} onChange={(v) => setMap({ ...map, [i]: v.trim() })} />
            ))}
          </div>
        </fieldset>
      )}
      {out && <CodeBlock code={out} label={t("repuesto.result")} />}
      <div className="grid gap-3 rounded-xl border border-white/10 p-4">
        <h4 className="text-sm font-medium text-foreground">{t("repuesto.full")}</h4>
        <Output t={t} mod="repuesto" issues={full.issues} steps={full.steps} undo={full.undo} label={t("repuesto.full")} />
      </div>
    </>
  )
}

function Filters({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<FilterOptions>("filtros")
  const r = filtersScript(ctx, o)
  return (
    <>
      <div className="grid gap-3">
        {(["spoof", "smb", "ssdp", "telnet"] as const).map((k) => (
          <Toggle key={k} label={t(`filtros.${k}`)} hint={t(`filtros.${k}Hint`)} on={o[k]} set={(v) => setO({ ...o, [k]: v })} />
        ))}
      </div>
      <div className={grid}>
        <NumberField label={t("filtros.udp")} unit={t("filtros.udpUnit")} value={o.udpLimit} integer max={10000} onChange={(v) => v !== null && setO({ ...o, udpLimit: v })} hint={t("filtros.udpHint")} />
        <NumberField label={t("filtros.dns")} unit={t("filtros.dnsUnit")} value={o.dnsRate} integer max={1000} onChange={(v) => v !== null && setO({ ...o, dnsRate: v })} hint={t("filtros.dnsHint")} />
      </div>
      <Output t={t} mod="filtros" issues={r.issues} steps={r.steps} undo={r.undo} label={t("filtros.label")} />
    </>
  )
}

function Alerts({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<AlertsOptions>("alertas")
  const r = alertsScript(ctx, o)
  return (
    <>
      <div className="grid gap-3">
        {(["config", "version"] as const).map((k) => (
          <Toggle key={k} label={t(`alertas.${k}`)} hint={t(`alertas.${k}Hint`)} on={o[k]} set={(v) => setO({ ...o, [k]: v })} />
        ))}
      </div>
      <div className={grid}>
        <NumberField label={t("alertas.ppp")} unit={t("alertas.pppUnit")} value={o.pppFails} integer max={100000} onChange={(v) => v !== null && setO({ ...o, pppFails: v })} hint={t("alertas.pppHint")} />
      </div>
      <Output t={t} mod="alertas" issues={r.issues} steps={r.steps} undo={r.undo} label={t("alertas.label")} />
    </>
  )
}

function Sheet({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [user, setUser] = useState("")
  const r = sheetScript(ctx)
  return (
    <>
      <Output t={t} mod="ficha" issues={r.issues} steps={r.steps} undo={r.undo} label={t("ficha.label")} />
      <div className="grid gap-3 rounded-xl border border-white/10 p-4">
        <h4 className="text-sm font-medium text-foreground">{t("ficha.howTitle")}</h4>
        <ul className="grid max-w-3xl gap-1.5 text-sm leading-relaxed text-zinc-300">
          {(t.raw("ficha.how") as string[]).map((x, k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden className="text-zinc-500">
                ·
              </span>
              {x}
            </li>
          ))}
        </ul>
        <div className={grid}>
          <TextField label={t("ficha.user")} value={user} onChange={setUser} hint={t("ficha.userHint")} />
        </div>
        <CodeBlock code={sheetCommand(user)} label={t("ficha.command")} />
      </div>
    </>
  )
}

function Sessions({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<SessionsOptions>("sesiones")
  const r = sessionsScript(ctx, o)
  return (
    <>
      <Toggle label={t("sesiones.stale")} hint={t("sesiones.staleHint")} on={o.stale} set={(v) => setO({ ...o, stale: v })} />
      <div className={grid}>
        <NumberField label={t("sesiones.flaps")} unit={t("sesiones.flapsUnit")} value={o.flaps} integer max={100} onChange={(v) => v !== null && setO({ ...o, flaps: v })} hint={t("sesiones.flapsHint")} />
      </div>
      <Output t={t} mod="sesiones" issues={r.issues} steps={r.steps} undo={r.undo} label={t("sesiones.label")} />
    </>
  )
}

function Pool({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<PoolOptions>("pool")
  const r = poolScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("pool.pct")} unit="%" value={o.pct} integer min={50} max={99} onChange={(v) => v !== null && setO({ ...o, pct: v })} hint={t("pool.pctHint")} />
      </div>
      <Output t={t} mod="pool" issues={r.issues} steps={r.steps} undo={r.undo} label={t("pool.label")} />
    </>
  )
}

function Conntrack({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<ConntrackOptions>("conexiones")
  const r = conntrackScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("conexiones.warn")} unit="%" value={o.warn} integer min={50} max={99} onChange={(v) => v !== null && setO({ ...o, warn: v })} hint={t("conexiones.levelHint")} />
        <NumberField label={t("conexiones.crit")} unit="%" value={o.crit} integer min={50} max={99} onChange={(v) => v !== null && setO({ ...o, crit: v })} />
        <NumberField label={t("conexiones.perClient")} unit={t("conexiones.perClientUnit")} value={o.perClient} integer min={100} max={100000} onChange={(v) => v !== null && setO({ ...o, perClient: v })} hint={t("conexiones.perClientHint")} />
      </div>
      <Output t={t} mod="conexiones" issues={r.issues} steps={r.steps} undo={r.undo} label={t("conexiones.label")} />
    </>
  )
}

function Ports({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<PortsOptions>("puertos")
  const r = portsScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <TextField label={t("puertos.ports")} value={o.ports} onChange={(v) => setO({ ...o, ports: v })} hint={t("puertos.portsHint")} />
        <NumberField label={t("puertos.drop")} unit={t("puertos.dropUnit")} value={o.dropDb} integer min={1} max={20} onChange={(v) => v !== null && setO({ ...o, dropDb: v })} hint={t("puertos.dropHint")} />
        <NumberField label={t("puertos.temp")} unit={t("puertos.tempUnit")} value={o.tempC} integer min={40} max={100} onChange={(v) => v !== null && setO({ ...o, tempC: v })} hint={t("puertos.tempHint")} />
      </div>
      <Output t={t} mod="puertos" issues={r.issues} steps={r.steps} undo={r.undo} label={t("puertos.label")} />
    </>
  )
}

function Priority({ t, ctx }: { t: T; ctx: AdvContext }) {
  const r = priorityScript(ctx)
  return <Output t={t} mod="prioridad" issues={r.issues} steps={r.steps} undo={r.undo} label={t("prioridad.label")} />
}

function PublicIps({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useOpts<PublicIpOptions>("ippublica")
  const rows = o.rows
  const wan = ctx.wans[0]?.name ?? ""
  const r = publicIpScript(ctx, rows)
  const set = (k: number, patch: Partial<PublicIpRow>) => setO({ rows: rows.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
  return (
    <>
      {rows.map((row, k) => (
        <div key={k} className="grid items-start gap-4 sm:grid-cols-3">
          <TextField label={t("ippublica.user", { n: k + 1 })} value={row.user} onChange={(v) => set(k, { user: v.trim() })} />
          <TextField label={t("ippublica.ip", { n: k + 1 })} value={row.ip} onChange={(v) => set(k, { ip: v.trim() })} />
          <SelectField label={t("ippublica.wan", { n: k + 1 })} value={row.wan} onChange={(v) => set(k, { wan: v })}>
            {ctx.wans.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </SelectField>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setO({ rows: [...rows, { user: "", ip: "", wan }] })} disabled={rows.length >= 20}>
          {t("ippublica.add")}
        </button>
        {rows.length > 1 && (
          <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setO({ rows: rows.slice(0, -1) })}>
            {t("ippublica.remove")}
          </button>
        )}
      </div>
      <Output t={t} mod="ippublica" issues={r.issues} steps={r.steps} undo={r.undo} label={t("ippublica.label")} />
    </>
  )
}
