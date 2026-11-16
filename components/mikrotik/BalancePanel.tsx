"use client"

import { useId, useState } from "react"
import { Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  balanceScript,
  balanceUndo,
  checkBalance,
  CLASSIFIERS,
  DETECTION,
  detectionSeconds,
  FAILOVER_SPEEDS,
  linkSpeed,
  pccWeights,
  PRIO_BYTES,
  PRIO_UDP_SIZE,
  WAN_TYPES,
  type LinkQueues,
  type Wan,
  type WanType,
} from "@/lib/mikrotik/balance"
import { fmtRate } from "@/lib/mikrotik/format"
import { MAX_WANS, nextMonitor, type BalanceState, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { CodeBlock } from "./CodeBlock"
import { IssueList } from "./IssueList"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { SetupChecks } from "./SetupChecks"
import { TextField } from "./TextField"

type Props = { state: LabState; onWans: (w: Wan[]) => void; onBalance: (b: BalanceState) => void }

/** Several internet links on the MikroTik: PCC balancing with failover (RouterOS v7). */
export function BalancePanel({ state, onWans, onBalance }: Props) {
  const t = useTranslations("mikrotik.links")
  const id = useId()
  const { wans, balance } = state
  // The networks are edited as text and applied line by line.
  const [netsText, setNetsText] = useState(balance.clients.join("\n"))
  const [prevClients, setPrevClients] = useState(balance.clients)
  if (prevClients !== balance.clients) {
    setPrevClients(balance.clients)
    if (netsText.split(/\s+/).filter(Boolean).join("\n") !== balance.clients.join("\n")) setNetsText(balance.clients.join("\n"))
  }

  const setWan = (k: number, patch: Partial<Wan>) => onWans(wans.map((w, i) => (i === k ? { ...w, ...patch } : w)))
  const addWan = () => {
    const n = wans.length + 1
    const last = wans.at(-1)
    onWans([...wans, { name: `WAN${n}`, type: last?.type ?? "dhcp", iface: `ether${n}`, gateway: "", mbps: last?.mbps ?? 1000, measuredMbps: null, upMbps: null, upstreamCgnat: false, monitor: nextMonitor(wans) }])
  }
  const removeWan = (k: number) => onWans(wans.filter((_, i) => i !== k))
  const set = (patch: Partial<BalanceState>) => onBalance({ ...balance, ...patch })
  const q = balance.queues
  const setQueues = (patch: Partial<LinkQueues>) => set({ queues: { ...q, ...patch } })

  const opts = { ...balance, wans }
  const issues = checkBalance(opts)
  const script = balanceScript(opts)
  // Weights and totals follow the measured speed when it's there.
  const weights = pccWeights(wans.map(linkSpeed))
  const slots = weights.reduce((a, b) => a + b, 0)
  const total = wans.reduce((a, w) => a + linkSpeed(w), 0)
  const recursive = balance.failover === "recursive"

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("wansTitle")}
            {state.deployment && <span className="font-normal text-zinc-400"> · {state.deployment}</span>}
          </h3>
          <p className="font-mono text-xs text-zinc-400">{t("total", { count: wans.length, total: fmtRate(total) })}</p>
        </div>
        <ul className="grid gap-3">
          {wans.map((w, k) => (
            <li key={k} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {w.name || `WAN${k + 1}`}
                  <span className="ml-2 font-mono text-xs font-normal text-zinc-400">{t("slots", { n: weights[k] ?? 0, total: slots })}</span>
                </p>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeWan(k)} disabled={wans.length <= 1} aria-label={t("remove", { name: w.name || `WAN${k + 1}` })}>
                  <X aria-hidden />
                </Button>
              </div>
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label={t("name")} value={w.name} onChange={(v) => setWan(k, { name: v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) })} />
                <SelectField label={t("type")} value={w.type} onChange={(v) => setWan(k, { type: v as WanType })} hint={t(`typeHint.${w.type}`)}>
                  {WAN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </SelectField>
                <TextField label={t("iface")} value={w.iface} onChange={(v) => setWan(k, { iface: v.trim() })} hint={t(`ifaceHint.${w.type}`)} />
                {w.type === "static" && <TextField label={t("gateway")} value={w.gateway} onChange={(v) => setWan(k, { gateway: v.trim() })} />}
                <NumberField label={t("mbps")} unit="Mbps" value={w.mbps} min={1} max={1e6} onChange={(v) => v !== null && setWan(k, { mbps: v })} />
                <NumberField
                  label={t("measuredMbps")}
                  unit="Mbps"
                  value={w.measuredMbps}
                  optional
                  min={1}
                  max={1e6}
                  hint={k === 0 ? t("measuredHint") : undefined}
                  onChange={(v) => setWan(k, { measuredMbps: v })}
                />
                <NumberField
                  label={t("upMbps")}
                  unit="Mbps"
                  value={w.upMbps}
                  optional
                  min={1}
                  max={1e6}
                  hint={k === 0 ? t("upHint") : undefined}
                  onChange={(v) => setWan(k, { upMbps: v })}
                />
                {recursive && <TextField label={t("monitor")} value={w.monitor} onChange={(v) => setWan(k, { monitor: v.trim() })} hint={k === 0 ? t("monitorHint") : undefined} />}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="button" variant="outline" onClick={addWan} disabled={wans.length >= MAX_WANS}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
          <p className="text-xs text-zinc-400">{t("addHint", { max: MAX_WANS })}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("classifier")}</p>
          <Choice
            label={t("classifier")}
            value={balance.classifier}
            onChange={(classifier) => set({ classifier })}
            options={CLASSIFIERS.map((c) => ({ value: c, label: t(`classifiers.${c}`) }))}
            className="sm:w-full"
          />
          <p className="text-xs leading-snug text-zinc-400">{t(`classifierHint.${balance.classifier}`)}</p>
        </div>
        <div className="grid gap-2">
          <p className="font-mono text-xs text-zinc-300">{t("failover")}</p>
          <Choice
            label={t("failover")}
            value={balance.failover}
            onChange={(failover) => set({ failover })}
            options={[
              { value: "recursive", label: t("failovers.recursive") },
              { value: "gateway", label: t("failovers.gateway") },
            ]}
            className="sm:w-full"
          />
          <p className="text-xs leading-snug text-zinc-400">{t(`failoverHint.${balance.failover}`)}</p>
        </div>
        <div className="grid gap-2 lg:col-span-2">
          <p className="font-mono text-xs text-zinc-300">{t("detect")}</p>
          <Choice
            label={t("detect")}
            value={balance.speed}
            onChange={(speed) => set({ speed })}
            options={FAILOVER_SPEEDS.map((s) => ({ value: s, label: t(`detects.${s}`, { s: detectionSeconds(s) }) }))}
          />
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">
            {t(`detectHint.${balance.speed}`, { interval: DETECTION[balance.speed].intervalS, count: DETECTION[balance.speed].count })}
          </p>
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <legend className="px-1 text-sm font-medium text-foreground">{t("queues.title")}</legend>
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_14rem]">
          <div className="grid gap-1.5">
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <Switch checked={q.shape} onCheckedChange={(shape) => setQueues({ shape })} />
              {t("queues.shape")}
            </label>
            <p className="text-xs leading-snug text-zinc-400">{t("queues.shapeHint")}</p>
          </div>
          {q.shape && (
            <NumberField
              label={t("queues.share")}
              unit="%"
              value={q.sharePct}
              min={50}
              max={100}
              hint={t("queues.shareHint")}
              onChange={(v) => v !== null && setQueues({ sharePct: v })}
            />
          )}
        </div>
        {q.shape && (
          <div className="grid gap-1.5">
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <Switch checked={q.prio} onCheckedChange={(prio) => setQueues({ prio })} />
              {t("queues.prio")}
            </label>
            <p className="text-xs leading-snug text-zinc-400">{t("queues.prioHint", { kb: PRIO_BYTES / 1000, size: PRIO_UDP_SIZE })}</p>
          </div>
        )}
        <div className="grid gap-1.5">
          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <Switch checked={q.alerts} onCheckedChange={(alerts) => setQueues({ alerts })} />
            {t("queues.alerts")}
          </label>
          <p className="text-xs leading-snug text-zinc-400">{t("queues.alertsHint")}</p>
        </div>
        <div className="grid gap-1.5">
          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <Switch checked={q.flush} onCheckedChange={(flush) => setQueues({ flush })} />
            {t("queues.flush")}
          </label>
          <p className="text-xs leading-snug text-zinc-400">{t("queues.flushHint")}</p>
        </div>
      </fieldset>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={id} className="font-mono text-xs text-zinc-300">
            {t("clients")}
          </label>
          <Textarea
            id={id}
            value={netsText}
            onChange={(e) => {
              setNetsText(e.target.value)
              set({ clients: e.target.value.split(/[\s,;]+/).filter(Boolean).slice(0, 32) })
            }}
            spellCheck={false}
            autoComplete="off"
            rows={3}
            aria-describedby={`${id}-hint`}
            className="min-h-24 bg-white/[0.03] font-mono text-sm md:text-xs"
          />
          <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
            {t("clientsHint")}
          </p>
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200 lg:mt-6">
          <Switch checked={balance.nat} onCheckedChange={(nat) => set({ nat })} />
          {t("nat")}
        </label>
      </div>

      <IssueList items={issues.map((i, k) => ({ key: `${k}-${i.code}`, level: i.level, context: i.wan, text: t(`issues.${i.code}`, { value: i.value ?? "" }) }))} />

      <SetupChecks compact />

      {script ? (
        <>
          <CodeBlock label={t("script")} code={script} />
          <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-400">
            {(t.raw("notes") as string[]).map((n, k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden className="text-zinc-600">
                  ·
                </span>
                {n}
              </li>
            ))}
          </ul>
          <details className="rounded-xl border border-white/10">
            <summary className="cursor-pointer rounded-xl p-4 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("undoTitle")}</summary>
            <div className="grid gap-3 px-4 pb-4">
              <p className="text-xs text-zinc-400">{t("undoHint")}</p>
              <CodeBlock label={t("undo")} code={balanceUndo(balance.speed)} />
            </div>
          </details>
          <p className="text-sm text-zinc-300">
            {t("capacity")}{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the other internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
            <a href="/calculadora#hora-pico" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {t("capacityLink")}
            </a>
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-300">{t("fixFirst")}</p>
      )}
    </div>
  )
}
