"use client"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { balanceScript, linkSpeed, pccBuckets, upSpeed, type Wan } from "@/lib/mikrotik/balance"
import { clientsOf } from "@/lib/mikrotik/deployments"
import { fmtNum, fmtRate } from "@/lib/mikrotik/format"
import { CONN_LIMIT, oltSetup, setupParts, setupPlans } from "@/lib/mikrotik/setup"
import { PRESETS, type LabState } from "@/lib/mikrotik/state"
import { CodeBlock } from "./CodeBlock"

type Props = { state: LabState; boundId: string | null; onWans: (w: Wan[]) => void }

const SPEEDS = PRESETS.map((p) => p.downMbps)
const PHASES = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"] as const
type Phase = (typeof PHASES)[number]
const TESTS = 14
const KEY = "gigafazt-mikrotik-guia"
const LINK = "text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white"

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

/** The owner's build checklist (BNG + multi-WAN PCC + CGNAT), phase by phase, with this deployment's commands. */
export function GuidePanel({ state, boundId, onWans }: Props) {
  const t = useTranslations("mikrotik.guide")
  const key = boundId ?? "sin-guardar"
  const [all, setAll] = useState(readChecks)
  const checked = new Set(all[key] ?? [])
  const toggle = (id: string, on: boolean) => {
    const next = { ...all, [key]: on ? [...checked, id] : [...checked].filter((x) => x !== id) }
    setAll(next)
    writeChecks(next)
  }

  const s = state.setup
  const clients = clientsOf({ status: state.status, capacity: state.capacity })
  const plans = useMemo(() => setupPlans(SPEEDS, state.rule), [state.rule])
  const parts = setupParts(s, {
    clients,
    wanIfaces: state.wans.map((w) => w.iface),
    balanced: state.balance.clients,
    monitors: state.wans.map((w) => w.monitor.trim()),
    cgnatUpstreams: state.wans.filter((w) => w.upstreamCgnat).map((w) => w.iface.trim()),
    pppoeIfaces: state.wans.filter((w) => w.type === "pppoe").map((w) => w.iface.trim()),
    name: state.deployment,
    plans,
    queue: state.queueKind,
  })
  const balance = balanceScript({ ...state.balance, wans: state.wans })
  const olt = oltSetup(s, { speeds: SPEEDS, names: plans.map((p) => p.name) })
  const { buckets, total } = pccBuckets(state.wans)
  const perIp = state.wans.length > 0 ? Math.ceil(clients / state.wans.length) : clients
  const setCgnat = (k: number, on: boolean) => onWans(state.wans.map((w, i) => (i === k ? { ...w, upstreamCgnat: on } : w)))

  const missing = (where: string, href: string) => (
    <p className="flex gap-2.5 text-sm text-amber-200">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <span>
        {t("missing")}{" "}
        <a href={href} className={LINK}>
          {where}
        </a>
      </span>
    </p>
  )

  const scripts: Record<Phase, React.ReactNode> = {
    p0: (
      <>
        <CodeBlock label={t("scripts.backup")} code={"/export file=fabrica\n/system backup save name=fabrica"} />
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("upstreams.caption")}>
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">{t("upstreams.caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {(["link", "iface", "type", "down", "up", "probe", "buckets", "cgnat"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                    {k === "buckets" ? t("upstreams.cols.buckets", { total }) : t(`upstreams.cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {state.wans.map((w, k) => (
                <tr key={k} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2.5 text-left font-sans text-sm font-normal text-foreground">
                    {w.name}
                  </th>
                  <td className="px-3 py-2.5">{w.iface}</td>
                  <td className="px-3 py-2.5 font-sans">{t(`upstreams.types.${w.type}`)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {fmtRate(linkSpeed(w))}
                    {w.measuredMbps === null && <span className="font-sans text-amber-300"> · {t("upstreams.notMeasured")}</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtRate(upSpeed(w))}</td>
                  <td className="px-3 py-2.5">{w.monitor}</td>
                  <td className="px-3 py-2.5">{buckets[k]}</td>
                  <td className="px-3 py-2.5">
                    <Checkbox checked={w.upstreamCgnat} onCheckedChange={(on) => setCgnat(k, on === true)} aria-label={t("upstreams.cgnatOne", { name: w.name })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-snug text-zinc-400">{t("upstreams.hint")}</p>
        {parts ? <CodeBlock label={t("scripts.base")} code={parts.base} /> : missing(t("where.setup"), "#configuracion")}
      </>
    ),
    p1: balance ? <CodeBlock label={t("scripts.balance")} code={balance} /> : missing(t("where.links"), "#enlaces"),
    p2: <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("sameScript")}</p>,
    p3: (
      <>
        <p className="flex gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 text-sm leading-relaxed text-zinc-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <span>{t("forwardBug")}</span>
        </p>
        {parts ? <CodeBlock label={t("scripts.cgnat")} code={parts.cgnat} /> : missing(t("where.setup"), "#configuracion")}
        {!s.collector.trim() && <p className="text-sm text-amber-200">{t("noCollector")}</p>}
      </>
    ),
    p4: (
      <>
        {parts ? <CodeBlock label={t("scripts.pppoe")} code={parts.pppoe} /> : missing(t("where.setup"), "#configuracion")}
        <CodeBlock label={t("scripts.radius")} code={"/radius add service=ppp address=<IP-RADIUS> secret=<SECRETO>\n/ppp aaa set use-radius=yes accounting=yes interim-update=5m"} />
        <p className="max-w-3xl text-sm leading-relaxed text-amber-200">{t("oltWarning")}</p>
        {olt ? <CodeBlock label={t("scripts.olt")} code={olt} /> : missing(t("where.setup"), "#configuracion")}
        <p className="text-sm text-zinc-300">
          {t("ontPointer")}{" "}
          <a href="#configuracion" className={LINK}>
            {t("where.setup")}
          </a>
        </p>
      </>
    ),
    p5: parts ? <CodeBlock label={t("scripts.hardening")} code={parts.hardening} /> : missing(t("where.setup"), "#configuracion"),
    p6: (
      <>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("tests.caption")}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{t("tests.caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("tests.cols.done")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("tests.cols.test")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("tests.cols.pass")}
                </th>
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

  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t("intro", { name: state.deployment.trim() || t("unnamed") })}</p>
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
