"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { clientsOf } from "@/lib/mikrotik/deployments"
import { speedLabel } from "@/lib/format"
import { checkSetup, mikrotikSetup, OLT_HEADROOM, oltSetup, ontTemplate, parseCidr, poolHosts, setupPlans, setupUndo, type SetupState } from "@/lib/mikrotik/setup"
import { PRESETS, type LabState } from "@/lib/mikrotik/state"
import { fmtNum } from "@/lib/mikrotik/format"
import { CodeBlock } from "./CodeBlock"
import { IssueList } from "./IssueList"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { TextField } from "./TextField"

type Props = { state: LabState; onSetup: (s: SetupState) => void }

/** The plans, by download speed (all symmetric). */
const SPEEDS = PRESETS.map((p) => p.downMbps)

/** VLANs, PPPoE and the OLT for a new deployment: MikroTik and Huawei commands that match. */
export function SetupPanel({ state, onSetup }: Props) {
  const t = useTranslations("mikrotik.config")
  const s = state.setup
  const set = (patch: Partial<SetupState>) => onSetup({ ...s, ...patch })

  const clients = clientsOf({ status: state.status, capacity: state.capacity })
  const ctx = {
    clients,
    wanIfaces: state.wans.map((w) => w.iface),
    balanced: state.capacity.internet === "links" ? state.balance.clients : null,
  }
  const plans = useMemo(() => setupPlans(SPEEDS, state.rule), [state.rule])
  const issues = checkSetup(s, ctx)
  const router = mikrotikSetup(s, { ...ctx, name: state.deployment, plans, queue: state.queueKind })
  const olt = oltSetup(s, { speeds: SPEEDS, names: plans.map((p) => p.name) })

  // One ONT, to copy for each client (not saved).
  const [ont, setOnt] = useState({ plan: 0, ponPort: "0/1/0", ontId: 0, sn: "", client: "" })
  const ontText = ontTemplate(s, ont)
  const pool = parseCidr(s.pool)

  return (
    <div className="surface grid min-w-0 gap-7 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-medium text-foreground">{t("router")}</legend>
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label={t("oltPort")} value={s.oltPort} onChange={(v) => set({ oltPort: v.trim() })} hint={t("oltPortHint")} />
          <NumberField label={t("internetVlan")} unit="VLAN" value={s.internetVlan} integer min={2} max={4094} onChange={(v) => v !== null && set({ internetVlan: v })} />
          <NumberField label={t("mgmtVlan")} unit="VLAN" value={s.mgmtVlan} integer min={2} max={4094} onChange={(v) => v !== null && set({ mgmtVlan: v })} />
          <TextField label={t("mgmtNet")} value={s.mgmtNet} onChange={(v) => set({ mgmtNet: v.trim() })} hint={t("mgmtNetHint")} />
          <TextField
            label={t("pool")}
            value={s.pool}
            onChange={(v) => set({ pool: v.trim() })}
            hint={pool ? t("poolHint", { hosts: fmtNum(poolHosts(pool), 0), clients: fmtNum(clients, 0) }) : t("poolHintBad")}
          />
          <TextField label={t("dns")} value={s.dns} onChange={(v) => set({ dns: v })} hint={t("dnsHint")} />
          <TextField label={t("service")} value={s.service} onChange={(v) => set({ service: v.trim() })} hint={t("serviceHint")} />
        </div>
        <div className="grid gap-1.5">
          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <Switch checked={s.firewall} onCheckedChange={(firewall) => set({ firewall })} />
            {t("firewall")}
          </label>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("firewallHint")}</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-medium text-foreground">{t("oltTitle")}</legend>
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label={t("oltUplink")} value={s.oltUplink} onChange={(v) => set({ oltUplink: v.trim() })} hint={t("oltUplinkHint")} />
        </div>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("oltPlans", { pct: Math.round((OLT_HEADROOM - 1) * 100) })}</p>
      </fieldset>

      <IssueList items={issues.map((i, k) => ({ key: `${k}-${i.code}`, level: i.level, text: t(`issues.${i.code}`, { value: i.value ?? "", need: fmtNum(i.need ?? 0, 0), have: fmtNum(i.have ?? 0, 0) }) }))} />

      <Tabs defaultValue="router" className="grid min-w-0 gap-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="router">{t("tabs.router")}</TabsTrigger>
          <TabsTrigger value="olt">{t("tabs.olt")}</TabsTrigger>
          <TabsTrigger value="ont">{t("tabs.ont")}</TabsTrigger>
        </TabsList>
        <TabsContent value="router" className="grid min-w-0 gap-4">
          {router ? (
            <>
              <CodeBlock label={t("routerScript")} code={router} />
              <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-400">
                {(t.raw("routerNotes") as string[]).map((n, k) => (
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
                  <CodeBlock label={t("undo")} code={setupUndo(s)} />
                </div>
              </details>
            </>
          ) : (
            <p className="text-sm text-amber-300">{t("fixFirst")}</p>
          )}
        </TabsContent>
        <TabsContent value="olt" className="grid min-w-0 gap-4">
          <p className="max-w-3xl text-sm leading-relaxed text-amber-200">{t("oltWarning")}</p>
          {olt ? <CodeBlock label={t("oltScript")} code={olt} /> : <p className="text-sm text-amber-300">{t("fixFirst")}</p>}
          <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-400">
            {(t.raw("oltNotes") as string[]).map((n, k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden className="text-zinc-600">
                  ·
                </span>
                {n}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="ont" className="grid min-w-0 gap-4">
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField label={t("ont.plan")} value={String(ont.plan)} onChange={(v) => setOnt({ ...ont, plan: Number(v) })}>
              {PRESETS.map((p, k) => (
                <option key={p.id} value={k}>
                  {speedLabel(p.downMbps)}
                </option>
              ))}
            </SelectField>
            <TextField label={t("ont.ponPort")} value={ont.ponPort} onChange={(v) => setOnt({ ...ont, ponPort: v.trim() })} hint={t("ont.ponPortHint")} />
            <NumberField label={t("ont.ontId")} unit="ID" value={ont.ontId} integer max={127} onChange={(v) => v !== null && setOnt({ ...ont, ontId: v })} />
            <TextField label={t("ont.sn")} value={ont.sn} onChange={(v) => setOnt({ ...ont, sn: v.trim() })} hint={t("ont.snHint")} />
            <TextField label={t("ont.client")} value={ont.client} onChange={(v) => setOnt({ ...ont, client: v })} />
          </div>
          {ontText ? <CodeBlock label={t("ont.script")} code={ontText} /> : <p className="text-sm text-amber-300">{t("ont.bad")}</p>}
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("ont.note", { vlan: s.internetVlan })}</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
