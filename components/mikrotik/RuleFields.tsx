"use client"

import { useTranslations } from "next-intl"
import { RULE_IDS, RULES, ruleId, type PlanRule } from "@/lib/mikrotik/burst"
import { fmtPct } from "@/lib/mikrotik/format"
import { Choice } from "./Choice"
import { NumberField } from "./NumberField"

type Props = {
  rule: PlanRule
  onRule: (rule: PlanRule) => void
  /** Without "Sin ráfaga" (the owner always sells plans with burst). */
  burstOnly?: boolean
  /** Replaces the closing line about where the rule is used. */
  note?: string
}

/** How a plan speed becomes queue values: named rules or custom shares. */
export function RuleFields({ rule, onRule, burstOnly = false, note }: Props) {
  const t = useTranslations("mikrotik.params")
  const id = ruleId(rule)
  const flat = rule.sustained >= 1
  const ids = burstOnly ? RULE_IDS.filter((k) => k !== "flat") : RULE_IDS
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="font-mono text-xs text-zinc-300">{t("rule")}</p>
      <Choice
        label={t("rule")}
        value={id}
        onChange={(v) => v !== "custom" && onRule(RULES[v])}
        options={[...ids.map((k) => ({ value: k, label: t(`rulesShort.${k}`) })), { value: "custom" as const, label: t("customRule") }]}
      />
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <NumberField
          label={t("ruleSustained")}
          hint={t("ruleSustainedHint")}
          unit="%"
          value={Math.round(rule.sustained * 1000) / 10}
          min={1}
          max={burstOnly ? 99 : 100}
          onChange={(v) => v !== null && onRule({ ...rule, sustained: v / 100 })}
        />
        {!flat && (
          <>
            <NumberField
              label={t("ruleThreshold")}
              hint={t("ruleThresholdHint")}
              unit="%"
              value={Math.round(rule.threshold * 1000) / 10}
              min={1}
              max={200}
              onChange={(v) => v !== null && onRule({ ...rule, threshold: v / 100 })}
            />
            <NumberField
              label={t("ruleBurstTime")}
              unit={t("unitS")}
              value={rule.burstTime}
              integer
              min={1}
              max={3600}
              onChange={(v) => v !== null && onRule({ ...rule, burstTime: v })}
            />
          </>
        )}
      </div>
      <p className="text-xs leading-snug text-zinc-400">
        {flat
          ? t("ruleFlat")
          : t("ruleHint", { sustained: fmtPct(rule.sustained), threshold: fmtPct(rule.threshold), time: rule.burstTime })}{" "}
        {note ?? t("ruleUse")}
      </p>
    </div>
  )
}
