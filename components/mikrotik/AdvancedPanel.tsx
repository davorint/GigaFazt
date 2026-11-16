"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  BTH_NET,
  DEFAULT_BACKUP_ROUTER,
  DEFAULT_BGP,
  DEFAULT_BOOST,
  DEFAULT_DNS_FILTER,
  DEFAULT_MONITOR,
  DEFAULT_MOROSOS,
  DEFAULT_REMOTE,
  DEFAULT_SHIELD,
  DEFAULT_USAGE,
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
  type ClientAction,
  type RouteRule,
} from "@/lib/mikrotik/advanced"
import { setupPlans } from "@/lib/mikrotik/setup"
import type { LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { CodeBlock } from "./CodeBlock"
import { IssueList } from "./IssueList"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { TextField } from "./TextField"

export const MODULES = ["morosos", "acceso", "dns", "uso", "escudo", "velocidad", "monitoreo", "respaldo", "destinos", "bgp"] as const
type Module = (typeof MODULES)[number]

type T = ReturnType<typeof useTranslations>

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
      <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} rows={rows} spellCheck={false} autoComplete="off" placeholder={placeholder} aria-describedby={hint ? `${id}-hint` : undefined} className="font-mono text-xs" />
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}

const grid = "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"

/** Issues, the script and its undo. */
function Output({ t, issues, script, undo, label, extra }: { t: T; issues: AdvIssue[]; script: string; undo: string; label: string; extra?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4">
      <IssueList items={issues.map((i, k) => ({ key: `${i.code}-${k}`, level: i.level, text: t(`issues.${i.code}`, { value: i.value ?? "" }) }))} />
      {script && <CodeBlock code={script} label={label} />}
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

/** Advanced scripts for the open deployment, each with its own undo (owner, 2026-11-16: run everything by hand). */
export function AdvancedPanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik.advanced")
  const [mod, setMod] = useState<Module>("morosos")
  const ctx: AdvContext = { name: state.deployment, setup: state.setup, wans: state.wans, queue: state.queueKind }
  const planNames = useMemo(() => setupPlans(state.setup.plans, state.setup.rule).map((p) => p.name), [state.setup.plans, state.setup.rule])

  return (
    <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-2 sm:max-w-md">
        <SelectField label={t("pick")} value={mod} onChange={(v) => setMod(v as Module)}>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {t(`modules.${m}.name`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-1.5">
        <h3 className="text-base font-medium text-foreground">{t(`modules.${mod}.name`)}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t(`modules.${mod}.lead`)}</p>
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
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}

function Morosos({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useState(DEFAULT_MOROSOS)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("morosos.label")} />
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
  const [o, setO] = useState(DEFAULT_REMOTE)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("acceso.label")} extra={r.hubSide ? <CodeBlock code={r.hubSide} label={t("acceso.hubSide")} /> : undefined} />
    </>
  )
}

function DnsFilter({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useState(DEFAULT_DNS_FILTER)
  const r = dnsFilterScript(ctx, o)
  return (
    <>
      <div className="grid gap-3">
        {(["ads", "adult", "force", "family"] as const).map((k) => (
          <Toggle key={k} label={t(`dns.${k}`)} hint={t(`dns.${k}Hint`, { plans: plans.map(familyName).join(", ") })} on={o[k]} set={(v) => setO({ ...o, [k]: v })} />
        ))}
      </div>
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("dns.label")} />
    </>
  )
}

function Usage({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useState(DEFAULT_USAGE)
  const r = usageScript(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("uso.cap")} unit="GB" value={o.capGb} max={100000} onChange={(v) => v !== null && setO({ ...o, capGb: v })} hint={t("uso.capHint")} />
        <NumberField label={t("uso.top")} unit="#" value={o.top} integer max={20} onChange={(v) => v !== null && setO({ ...o, top: v })} hint={t("uso.topHint")} />
        <TextField label={t("uso.time")} value={o.reportTime} onChange={(v) => setO({ ...o, reportTime: v.trim() })} />
      </div>
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("uso.label")} />
    </>
  )
}

function Shield({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useState(DEFAULT_SHIELD)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("escudo.label")} />
    </>
  )
}

function Speeds({ t, ctx, plans }: { t: T; ctx: AdvContext; plans: string[] }) {
  const [o, setO] = useState(DEFAULT_BOOST)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("velocidad.label")} />
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
  const [o, setO] = useState(DEFAULT_MONITOR)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("monitoreo.label")} />
    </>
  )
}

function BackupRouter({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [o, setO] = useState(DEFAULT_BACKUP_ROUTER)
  const r = backupRouterScripts(ctx, o)
  return (
    <>
      <div className={grid}>
        <NumberField label={t("respaldo.vrid")} unit="VRID" value={o.vrid} integer min={1} max={255} onChange={(v) => v !== null && setO({ ...o, vrid: v })} />
        <NumberField label={t("respaldo.pado")} unit="ms" value={o.padoDelay} integer min={100} max={5000} onChange={(v) => v !== null && setO({ ...o, padoDelay: v })} hint={t("respaldo.padoHint")} />
        <TextField label={t("respaldo.user")} value={o.syncUser} onChange={(v) => setO({ ...o, syncUser: v.trim() })} />
      </div>
      <Output
        t={t}
        issues={r.issues}
        script={r.main}
        undo={r.undoMain}
        label={t("respaldo.main")}
        extra={r.backup ? <CodeBlock code={r.backup} label={t("respaldo.backup")} /> : undefined}
      />
    </>
  )
}

function Destinations({ t, ctx }: { t: T; ctx: AdvContext }) {
  const [rules, setRules] = useState<RouteRule[]>([{ wan: ctx.wans[0]?.name ?? "", dest: "" }])
  const r = routeScript(ctx, rules)
  const set = (k: number, patch: Partial<RouteRule>) => setRules(rules.map((x, j) => (j === k ? { ...x, ...patch } : x)))
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
        <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setRules([...rules, { wan: ctx.wans[0]?.name ?? "", dest: "" }])} disabled={rules.length >= 8}>
          {t("destinos.add")}
        </button>
        {rules.length > 1 && (
          <button type="button" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5" onClick={() => setRules(rules.slice(0, -1))}>
            {t("destinos.remove")}
          </button>
        )}
      </div>
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("destinos.label")} />
    </>
  )
}

function Bgp({ t }: { t: T }) {
  const [o, setO] = useState(DEFAULT_BGP)
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
      <Output t={t} issues={r.issues} script={r.script} undo={r.undo} label={t("bgp.label")} />
    </>
  )
}
