"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { AreaField } from "@/components/surveys/SurveyFields"
import { parseBulk } from "@/lib/mikrotik/bulk"
import { planDefaults } from "@/lib/mikrotik/burst"
import { compare } from "@/lib/asternos/burst"
import { carriersBlock, checksBlock, failoverBlock, planBursts, plansBlock, usersBlock } from "@/lib/asternos/config"
import { AsterCode } from "./AsterCode"
import { useAsterDeployment } from "./useAsterDeployment"

const TABS = ["users", "plans", "carriers", "checks"] as const
type Tab = (typeof TABS)[number]

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)} %`
const mb = (bytes: number) => `${Math.round(bytes / 1e6).toLocaleString("es-MX")} MB`

/** Scripts AsterNOS: the parts of a deployment one at a time (users, plans with burst, carriers, checks). */
export function AsterScripts() {
  const t = useTranslations("asternos.scripts")
  const [d] = useAsterDeployment()
  const [tab, setTab] = useState<Tab>("users")
  const name = (d.hostname || "asternos").replace(/[^\w-]/g, "")
  return (
    <div className="mt-8 grid gap-6">
      <p className="text-sm text-zinc-300">
        {t("uses", { plans: d.plans.length, carriers: d.carriers.length })}{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session) */}
        <a href="/interno/equipos-telecom/asternos/guia" className="underline decoration-white/30 underline-offset-4 hover:text-zinc-100">
          {t("editInGuide")}
        </a>
      </p>
      <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-foreground aria-selected:bg-white/10 aria-selected:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={t(`tabs.${tab}`)}>
        {tab === "users" && <Users name={name} />}
        {tab === "plans" && <Plans name={name} />}
        {tab === "carriers" && (
          <div className="grid gap-6">
            <p className="text-sm text-zinc-300">{t("carriersWhat")}</p>
            <AsterCode block={carriersBlock(d)} title={t("tabs.carriers")} file={`asternos-${name}-carriers.txt`} />
            <p className="text-sm text-zinc-300">{t("failoverWhat")}</p>
            <AsterCode block={failoverBlock(d)} title={t("failover")} file={`asternos-${name}-failover.txt`} />
          </div>
        )}
        {tab === "checks" && (
          <div className="grid gap-3">
            <p className="text-sm text-zinc-300">{t("checksWhat")}</p>
            <AsterCode block={checksBlock()} title={t("tabs.checks")} file={`asternos-${name}-checks.txt`} />
          </div>
        )}
      </div>
    </div>
  )
}

/** PPPoE users for each plan's server, from a pasted list (name, user, plan, password); the list never leaves the phone. */
function Users({ name }: { name: string }) {
  const t = useTranslations("asternos.scripts")
  const [d] = useAsterDeployment()
  const [text, setText] = useState("")
  const parsed = useMemo(() => parseBulk(text, "pppoe", d.plans.map((p) => ({ id: p.name, mbps: p.mbps }))), [text, d.plans])
  const rows = parsed.rows.filter((r) => r.password).map((r) => ({ user: r.id, password: r.password ?? "", mbps: r.planMbps }))
  const { block, unplaced } = usersBlock(d, rows)
  return (
    <div className="grid gap-3">
      <p className="text-sm text-zinc-300">{t("usersWhat")}</p>
      <AreaField label={t("usersList")} value={text} onChange={setText} rows={6} hint={t("usersHint")} />
      {parsed.errors.length > 0 && <p className="text-sm text-amber-200">{t("usersErrors", { n: parsed.errors.length, lines: parsed.errors.slice(0, 8).map((e) => e.line).join(", ") })}</p>}
      {unplaced.length > 0 && <p className="text-sm text-amber-200">{t("usersUnplaced", { users: unplaced.slice(0, 10).join(", ") })}</p>}
      {rows.length > 0 && <AsterCode block={block} title={t("tabs.users")} file={`asternos-${name}-usuarios.txt`} />}
    </div>
  )
}

/** Each plan: its AsterNOS burst values next to the MikroTik's, the comparison, and its policers to download. */
function Plans({ name }: { name: string }) {
  const t = useTranslations("asternos.scripts")
  const [d] = useAsterDeployment()
  const bursts = useMemo(() => planBursts(d), [d])
  return (
    <div className="grid gap-6">
      <p className="text-sm text-zinc-300">{t("plansWhat")}</p>
      {bursts.map(({ plan, burst }, i) => {
        const q = planDefaults(plan.mbps, d.rule)
        const rows = compare(q, burst)
        return (
          <section key={i} aria-label={plan.name} className="grid gap-3 rounded-xl border border-white/10 p-4">
            <h3 className="text-base font-medium text-foreground">
              {plan.name} · {t("planLine", { mbps: plan.mbps, vlan: plan.vlan, pool: plan.pool })}
            </h3>
            {burst.burst ? (
              <>
                <p className="text-sm text-zinc-300">{t("mikrotikLine", { max: q.maxLimit, burst: q.burstLimit, threshold: q.burstThreshold, time: q.burstTime, real: burst.burstS })}</p>
                <p className="text-sm text-zinc-300">
                  {d.design === "two-stage"
                    ? t("twoStageLine", { refill: burst.twoStage.refillMbps, share: Math.round(burst.twoStage.refillShare * 100), size: mb(burst.twoStage.size), user: burst.twoStage.userMbps, over: burst.twoStage.overMbps })
                    : t("singleLine", { cir: burst.single.cirMbps, pir: burst.single.pirMbps, cbs: mb(burst.single.cbs) })}
                </p>
                <div tabIndex={0} role="region" aria-label={t("compareTitle", { plan: plan.name })} className="overflow-x-auto rounded-lg border border-white/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <table className="w-full text-sm">
                    <caption className="px-3 pt-2 text-left text-xs text-zinc-400">{t("compareCaption")}</caption>
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-3 py-2 text-left font-mono text-[0.7rem] font-normal uppercase text-zinc-400">{t("cols.pattern")}</th>
                        <th className="px-3 py-2 text-right font-mono text-[0.7rem] font-normal uppercase text-zinc-400">{t("cols.twoStage")}</th>
                        <th className="px-3 py-2 text-right font-mono text-[0.7rem] font-normal uppercase text-zinc-400">{t("cols.single")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const a = r.twoStageMb / r.mikrotikMb - 1
                        const b = r.singleMb / r.mikrotikMb - 1
                        const tone = (x: number) => (Math.abs(x) <= 0.1 ? "text-emerald-300" : Math.abs(x) <= 0.25 ? "text-amber-200" : "text-red-300")
                        return (
                          <tr key={r.id} className="border-b border-white/5 last:border-0">
                            <td className="px-3 py-2 text-zinc-100">{t(`patterns.${r.id}`)}</td>
                            <td className={`px-3 py-2 text-right font-mono ${tone(a)}`}>{pct(a)}</td>
                            <td className={`px-3 py-2 text-right font-mono ${tone(b)}`}>{pct(b)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-300">{t("noBurst", { mbps: plan.mbps })}</p>
            )}
            <AsterCode block={plansBlock(d, i)} title={plan.name} file={`asternos-${name}-plan-${plan.name.replace(/[^\w-]/g, "")}.txt`} />
          </section>
        )
      })}
    </div>
  )
}
