"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { AreaField } from "@/components/surveys/SurveyFields"
import { parseBulk } from "@/lib/mikrotik/bulk"
import { burstSeconds, hasBurst } from "@/lib/asternos/plan"
import { carriersBlock, checksBlock, failoverBlock, planShape, plansBlock, usersBlock } from "@/lib/asternos/config"
import { AsterCode } from "./AsterCode"
import { useAsterDeployment } from "./useAsterDeployment"

const TABS = ["users", "plans", "carriers", "checks"] as const
type Tab = (typeof TABS)[number]


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
  const { block, unplaced, badPassword } = usersBlock(d, rows)
  return (
    <div className="grid gap-3">
      <p className="text-sm text-zinc-300">{t("usersWhat")}</p>
      <AreaField label={t("usersList")} value={text} onChange={setText} rows={6} hint={t("usersHint")} />
      {parsed.errors.length > 0 && <p className="text-sm text-amber-200">{t("usersErrors", { n: parsed.errors.length, lines: parsed.errors.slice(0, 8).map((e) => e.line).join(", ") })}</p>}
      {unplaced.length > 0 && <p className="text-sm text-amber-200">{t("usersUnplaced", { users: unplaced.slice(0, 10).join(", ") })}</p>}
      {badPassword.length > 0 && <p className="text-sm text-amber-200">{t("usersBadPassword", { users: badPassword.slice(0, 10).join(", ") })}</p>}
      {rows.length > 0 && <AsterCode block={block} title={t("tabs.users")} file={`asternos-${name}-usuarios.txt`} />}
    </div>
  )
}

/** Each plan: its shape and its limiters to download (designed and simulated in the Simulador). */
function Plans({ name }: { name: string }) {
  const t = useTranslations("asternos.scripts")
  const [d] = useAsterDeployment()
  return (
    <div className="grid gap-6">
      <p className="text-sm text-zinc-300">{t("plansWhat")}</p>
      {d.plans.map((plan, i) => {
        const sh = planShape(plan)
        return (
          <section key={i} aria-label={plan.name} className="grid gap-3 rounded-xl border border-white/10 p-4">
            <h3 className="text-base font-medium text-foreground">
              {plan.name} · {t("planLine", { mbps: plan.mbps, vlan: plan.vlan, pool: plan.pool })}
            </h3>
            <p className="text-sm text-zinc-300">
              {hasBurst(sh)
                ? t("shapeLine", { peak: sh.peakMbps, sustained: sh.sustainedMbps, burst: sh.burstMB, recharge: sh.rechargeMbps, seconds: Math.round(burstSeconds(sh) * 10) / 10 })
                : t("noBurst", { mbps: plan.mbps })}
            </p>
            <AsterCode block={plansBlock(d, i)} title={plan.name} file={`asternos-${name}-plan-${plan.name.replace(/[^\w-]/g, "")}.txt`} />
          </section>
        )
      })}
    </div>
  )
}
