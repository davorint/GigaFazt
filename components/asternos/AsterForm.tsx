"use client"

import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { GRID, PickField } from "@/components/surveys/SurveyFields"
import { RULES, RULE_IDS, ruleId, type RuleId } from "@/lib/mikrotik/burst"
import { BURST_DESIGNS, type BurstDesign } from "@/lib/asternos/burst"
import { deploymentIssues, type AsterCarrier, type AsterDeployment, type AsterPlan } from "@/lib/asternos/config"

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const CARD = "grid gap-3 rounded-xl border border-white/10 p-3"

const ports = (s: string) => [...new Set(s.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100))]

/** The deployment's fields: device, OLT, plans (VLAN + pool), carriers, burst design. Saved on this phone as typed. */
export function AsterForm({ d, set }: { d: AsterDeployment; set: (p: Partial<AsterDeployment>) => void }) {
  const t = useTranslations("asternos.form")
  const upPlan = (i: number, p: Partial<AsterPlan>) => set({ plans: d.plans.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const upCarrier = (i: number, p: Partial<AsterCarrier>) => set({ carriers: d.carriers.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const issues = deploymentIssues(d)
  const rid = ruleId(d.rule)
  return (
    <div className="grid gap-6">
      <fieldset className={CARD}>
        <legend className="px-1 text-sm font-medium text-foreground">{t("device")}</legend>
        <div className={GRID}>
          <TextField label={t("hostname")} value={d.hostname} onChange={(v) => set({ hostname: v })} hint={t("hostnameHint")} />
          <TextField label={t("adminUser")} value={d.adminUser} onChange={(v) => set({ adminUser: v })} hint={t("adminUserHint")} />
          <NumberField label={t("mgmtPort")} unit="eth" integer min={1} max={99} value={d.mgmtPort} onChange={(v) => set({ mgmtPort: v ?? 1 })} />
          <TextField label={t("mgmtAddress")} value={d.mgmtAddress} onChange={(v) => set({ mgmtAddress: v.trim() })} hint={t("mgmtAddressHint")} />
          <TextField label={t("mgmtGateway")} value={d.mgmtGateway} onChange={(v) => set({ mgmtGateway: v.trim() })} />
          <TextField label={t("ntp")} value={d.ntp} onChange={(v) => set({ ntp: v.trim() })} />
          <TextField label={t("dns")} value={d.dns} onChange={(v) => set({ dns: v.trim() })} hint={t("dnsHint")} />
          <TextField label={t("oltPorts")} value={d.oltPorts.join(", ")} onChange={(v) => set({ oltPorts: ports(v) })} hint={t("oltPortsHint")} />
        </div>
      </fieldset>

      <fieldset className={CARD}>
        <legend className="px-1 text-sm font-medium text-foreground">{t("plans")}</legend>
        <p className="text-xs text-zinc-400">{t("plansHint")}</p>
        {d.plans.map((p, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-white/10 p-3">
            <div className={GRID}>
              <TextField label={t("planName")} value={p.name} onChange={(v) => upPlan(i, { name: v })} />
              <NumberField label={t("planSpeed")} unit="Mbps" min={1} max={10000} value={p.mbps} onChange={(v) => upPlan(i, { mbps: v ?? 1 })} />
              <NumberField label={t("vlan")} unit="VLAN" integer min={2} max={4094} value={p.vlan} onChange={(v) => upPlan(i, { vlan: v ?? 2 })} />
              <TextField label={t("pool")} value={p.pool} onChange={(v) => upPlan(i, { pool: v.trim() })} hint={t("poolHint")} />
            </div>
            <button type="button" onClick={() => set({ plans: d.plans.filter((_, k) => k !== i) })} className={DANGER}>
              {t("removePlan")}
            </button>
          </div>
        ))}
        {d.plans.length < 8 && (
          <button type="button" onClick={() => set({ plans: [...d.plans, { name: `Plan ${d.plans.length + 1}`, mbps: 100, vlan: 100 + d.plans.length, pool: `100.64.${10 + d.plans.length}.0/24` }] })} className={SMALL}>
            {t("addPlan")}
          </button>
        )}
        <div className={GRID}>
          <PickField
            label={t("rule")}
            value={rid === "custom" ? "s20" : rid}
            onChange={(v: RuleId) => set({ rule: RULES[v] })}
            options={RULE_IDS.map((id) => ({ value: id, label: t(`rules.${id}`) }))}
            hint={t("ruleHint")}
          />
          <PickField label={t("design")} value={d.design} onChange={(v: BurstDesign) => set({ design: v })} options={BURST_DESIGNS.map((x) => ({ value: x, label: t(`designs.${x}`) }))} hint={t(`designsHint.${d.design}`)} />
        </div>
      </fieldset>

      <fieldset className={CARD}>
        <legend className="px-1 text-sm font-medium text-foreground">{t("carriers")}</legend>
        {d.carriers.map((c, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-white/10 p-3">
            <div className={GRID}>
              <TextField label={t("carrierName")} value={c.name} onChange={(v) => upCarrier(i, { name: v })} />
              <NumberField label={t("carrierPort")} unit="eth" integer min={1} max={99} value={c.port} onChange={(v) => upCarrier(i, { port: v ?? 1 })} />
              <PickField label={t("carrierMode")} value={c.mode} onChange={(v: AsterCarrier["mode"]) => upCarrier(i, { mode: v })} options={(["static", "dhcp"] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))} />
              {c.mode === "static" && <TextField label={t("carrierAddress")} value={c.address} onChange={(v) => upCarrier(i, { address: v.trim() })} hint={t("carrierAddressHint")} />}
              {c.mode === "static" && <TextField label={t("carrierGateway")} value={c.gateway} onChange={(v) => upCarrier(i, { gateway: v.trim() })} />}
              <NumberField label={t("carrierMbps")} unit="Mbps" min={0} max={100000} value={c.mbps} onChange={(v) => upCarrier(i, { mbps: v ?? 0 })} />
            </div>
            <button type="button" onClick={() => set({ carriers: d.carriers.filter((_, k) => k !== i) })} className={DANGER}>
              {t("removeCarrier")}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ carriers: [...d.carriers, { name: `Carrier ${d.carriers.length + 1}`, port: 5 + d.carriers.length, mode: "static", address: "", gateway: "", mbps: 500 }] })} className={SMALL}>
          {t("addCarrier")}
        </button>
        <div className={GRID}>
          <PickField label={t("wanMode")} value={d.wanMode} onChange={(v: AsterDeployment["wanMode"]) => set({ wanMode: v })} options={(["balance", "failover"] as const).map((m) => ({ value: m, label: t(`wanModes.${m}`) }))} />
          <TextField label={t("probe")} value={d.probe} onChange={(v) => set({ probe: v.trim() })} hint={t("probeHint")} />
        </div>
      </fieldset>

      {issues.length > 0 && (
        <div role="note" className="grid gap-1 rounded-xl border border-amber-400/30 p-3">
          {issues.map((x, k) => (
            <p key={k} className="text-sm text-amber-100">
              {t(`issues.${x.code}`, { plan: "plan" in x ? x.plan : "", carrier: "carrier" in x ? x.carrier : "", n: "n" in x ? x.n : 0 })}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
