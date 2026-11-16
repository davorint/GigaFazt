"use client"

import { Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PlanRule } from "@/lib/mikrotik/burst"
import { rateLimit } from "@/lib/mikrotik/routeros"
import { MAX_PLANS, planLabel, setupPlans, type SetupPlan } from "@/lib/mikrotik/setup"
import { RuleFields } from "./RuleFields"

type Props = {
  plans: SetupPlan[]
  rule: PlanRule
  onPlans: (p: SetupPlan[]) => void
  onRule: (r: PlanRule) => void
  /** Name of the table's scroll region: unique when the editor appears twice on a page. */
  label?: string
}

const INPUT = "h-9 min-w-0 bg-white/[0.03] font-mono text-sm"

/** The deployment's plans (200 Mbps, 500 Mbps, 1 Gbps and any custom one) and the burst rule that turns them into queues. */
export function PlansEditor({ plans, rule, onPlans, onRule, label }: Props) {
  const t = useTranslations("mikrotik.config.plans")
  const set = (k: number, patch: Partial<SetupPlan>) => onPlans(plans.map((p, i) => (i === k ? { ...p, ...patch } : p)))
  const speed = (text: string) => {
    const v = Number(text.replace(",", "."))
    return Number.isFinite(v) && v > 0 ? v : 0
  }
  const built = setupPlans(plans, rule)

  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <RuleFields rule={rule} onRule={onRule} burstOnly note={t("ruleNote")} />
      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={label ?? t("caption")}>
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">{label ?? t("caption")}</caption>
          <thead className="text-xs text-zinc-400">
            <tr className="border-b border-white/10">
              {(["name", "down", "up", "queue", "remove"] as const).map((k) => (
                <th key={k} scope="col" className="px-2 py-2.5 font-normal whitespace-nowrap">
                  {t(`cols.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((p, k) => {
              const label = planLabel(p, rule)
              const b = built.find((x) => x.name === label)
              return (
                <tr key={k} className="border-t border-white/5 align-top">
                  <td className="px-2 py-2">
                    <Input
                      className={`${INPUT} w-40`}
                      value={p.name}
                      placeholder={label}
                      aria-label={t("field", { what: t("cols.name"), n: k + 1 })}
                      onChange={(e) => set(k, { name: e.target.value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 32) })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${INPUT} w-24`} inputMode="decimal" value={p.down || ""} aria-label={t("field", { what: t("cols.down"), n: k + 1 })} onChange={(e) => set(k, { down: speed(e.target.value) })} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${INPUT} w-24`} inputMode="decimal" value={p.up || ""} aria-label={t("field", { what: t("cols.up"), n: k + 1 })} onChange={(e) => set(k, { up: speed(e.target.value) })} />
                  </td>
                  <td className="px-2 py-3.5 font-mono text-xs whitespace-nowrap text-zinc-300">{b ? rateLimit(b.pair) : "—"}</td>
                  <td className="px-2 py-2">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => onPlans(plans.filter((_, i) => i !== k))} disabled={plans.length <= 1} aria-label={t("remove", { name: label })}>
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
        <Button type="button" variant="outline" disabled={plans.length >= MAX_PLANS} onClick={() => onPlans([...plans, { name: "", down: 100, up: 100 }])}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("hint")}</p>
      </div>
    </div>
  )
}
