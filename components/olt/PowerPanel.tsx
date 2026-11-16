"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { Choice } from "@/components/mikrotik/Choice"
import { NumberField } from "@/components/mikrotik/NumberField"
import { SelectField } from "@/components/mikrotik/SelectField"
import { Switch } from "@/components/ui/switch"
import { AC_BOARDS, CHASSIS_INPUT_A, POWER_SYSTEMS } from "@/lib/olt-kb"
import { BATTERY_USABLE, CHARGE_RATE, DC_V, type Mains, type PowerIssue, type PowerPlan } from "@/lib/olt-power"
import { Src } from "./Src"

export type PowerChoice = { system: string; mains: Mains; hours: number; spare: boolean }
export const DEFAULT_POWER: PowerChoice = { system: POWER_SYSTEMS[0].id, mains: "220", hours: 4, spare: true }

const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 })

/** How the built OLT gets its power: the AC board's limit, or the external −48 V system, rectifiers and batteries it needs. */
export function PowerPanel({ plan, choice, onChange, chassis }: { plan: PowerPlan; choice: PowerChoice; onChange: (c: PowerChoice) => void; chassis: string }) {
  const t = useTranslations("olt.builder.energy")
  const set = (patch: Partial<PowerChoice>) => onChange({ ...choice, ...patch })
  const issue = (i: PowerIssue) => {
    switch (i.code) {
      case "acOver":
        return t("issues.acOver", { board: i.board, rated: fmt(i.ratedW) })
      case "tooFewSlots":
        return t("issues.tooFewSlots", { need: i.need, slots: i.slots })
      case "fromChassis":
        return t("issues.fromChassis", { amps: fmt(i.amps) })
      case "outputSmall":
        return t("issues.outputSmall", { amps: fmt(i.amps), output: fmt(i.outputA) })
      default:
        return t(`issues.${i.code}`)
    }
  }
  const chassisA = CHASSIS_INPUT_A[chassis]
  const sys = plan.system

  return (
    <div className="surface grid gap-4 rounded-2xl p-5">
      <div className="grid gap-1">
        <h3 className="text-base font-medium text-foreground">{t("title")}</h3>
        <p className="text-sm text-zinc-300">
          {t(plan.fromChassis ? "loadChassis" : "load", { amps: fmt(plan.loadA), volts: DC_V })}
          {chassisA && (
            <>
              {" "}
              {t("chassisMax", { amps: fmt(chassisA.v) })}
              <Src id={chassisA.src} />
            </>
          )}
        </p>
      </div>

      {plan.mode === "ac" && plan.acBoard && (
        <p className="text-sm leading-relaxed text-zinc-300">
          {t("ac", { board: plan.acBoard.code, rated: fmt(plan.acBoard.ratedW) })}
          <Src id={AC_BOARDS[plan.acBoard.code].src} />
          {plan.batteryAh > 0 && ` ${t("acBattery", { ah: fmt(plan.batteryAh), hours: fmt(choice.hours) })}`}
        </p>
      )}

      {plan.mode === "dc" && sys && (
        <>
          <p className="text-sm leading-relaxed text-zinc-300">{t("dc")}</p>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <SelectField label={t("system")} value={choice.system} onChange={(v) => set({ system: v })}>
              {POWER_SYSTEMS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </SelectField>
            <NumberField label={t("hours")} unit="h" value={choice.hours} max={24} hint={t("hoursHint", { usable: Math.round(BATTERY_USABLE * 100), rate: CHARGE_RATE })} onChange={(v) => v !== null && set({ hours: v })} />
          </div>
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("mains")}</p>
            <Choice label={t("mains")} value={choice.mains} onChange={(mains: Mains) => set({ mains })} options={(["220", "127"] as const).map((k) => ({ value: k, label: t(`mainsOptions.${k}`) }))} />
          </div>
          <label className="flex items-center gap-3 text-sm text-zinc-200">
            <Switch checked={choice.spare} onCheckedChange={(v) => set({ spare: v })} aria-label={t("spare")} />
            {t("spare")}
          </label>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-zinc-400">{t("module")}</dt>
              <dd className="mt-0.5 text-zinc-100">
                {fmt(plan.moduleA)} A
                <Src id={(choice.mains === "220" ? sys.moduleA.high : sys.moduleA.low).src} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("modules")}</dt>
              <dd className="mt-0.5 text-zinc-100">{t("modulesValue", { n: plan.modules, slots: sys.slots.v })}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("battery")}</dt>
              <dd className="mt-0.5 text-zinc-100">{plan.batteryAh ? t("batteryValue", { ah: fmt(plan.batteryAh), charge: fmt(plan.chargeA) }) : t("none")}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("outputs")}</dt>
              <dd className="mt-0.5 text-zinc-100">
                {sys.outputs.v}
                <Src id={sys.outputs.src} />
              </dd>
            </div>
          </dl>
        </>
      )}

      {plan.issues.length > 0 && (
        <ul className="grid gap-2">
          {plan.issues.map((i, k) => (
            <li key={k} className="flex gap-2 text-sm leading-snug text-zinc-200">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <span>{issue(i)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
