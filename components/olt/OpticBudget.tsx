"use client"

import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { NumberField } from "@/components/mikrotik/NumberField"
import { Choice } from "@/components/mikrotik/Choice"
import { SelectField } from "@/components/mikrotik/SelectField"
import { DEFAULT_BUDGET, ONT_DEFAULTS, opticBudget, type BudgetInput } from "@/lib/olt-budget"
import { PON_KINDS, SPLITTERS, type PonKind } from "@/lib/olt-kb"
import { Src } from "./Src"

const MAX_STAGES = 3
const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 })
const VERDICT: Record<"ok" | "tight" | "no", string> = { ok: "text-emerald-300", tight: "text-amber-300", no: "text-rose-300" }

/** Which module class a PON run needs: loss from the OLT to the farthest ONT against each class budget. */
export function OpticBudget() {
  const t = useTranslations("olt.budget")
  const [i, setI] = useState<BudgetInput>(DEFAULT_BUDGET)
  const r = opticBudget(i)
  const set = (patch: Partial<BudgetInput>) => setI({ ...i, ...patch })
  const setStage = (k: number, ratio: number) => set({ splitters: i.splitters.map((x, j) => (j === k ? ratio : x)) })

  return (
    <div className="surface grid gap-5 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-1.5">
        <h3 className="text-base font-medium text-foreground">{t("title")}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("lead")}</p>
      </div>
      <div className="grid gap-2">
        <p className="font-mono text-xs text-zinc-300">{t("tech")}</p>
        {/* Another PON type: its classes, and its ONT's values (the typical ones are labeled). */}
        <Choice label={t("tech")} value={i.tech} onChange={(tech: PonKind) => setI({ ...i, tech, ...ONT_DEFAULTS[tech] })} options={PON_KINDS.map((k) => ({ value: k, label: t(`techs.${k}`) }))} />
        <p className="text-xs leading-snug text-zinc-400">{t(`techHint.${i.tech}`)}</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="font-mono text-xs text-zinc-300">{t("splitters")}</p>
            <div className="flex flex-wrap items-end gap-3">
              {i.splitters.map((ratio, k) => (
                <SelectField key={k} label={t("stage", { n: k + 1 })} value={String(ratio)} onChange={(v) => setStage(k, Number(v))} className="w-32">
                  {SPLITTERS.map((s) => (
                    <option key={s.ratio} value={s.ratio}>
                      1:{s.ratio}
                    </option>
                  ))}
                </SelectField>
              ))}
              <div className="flex gap-2 pb-0.5">
                <Button type="button" variant="outline" size="icon" onClick={() => set({ splitters: [...i.splitters, 2] })} disabled={i.splitters.length >= MAX_STAGES} aria-label={t("addStage")}>
                  <Plus aria-hidden />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => set({ splitters: i.splitters.slice(0, -1) })} disabled={i.splitters.length <= 1} aria-label={t("removeStage")}>
                  <Minus aria-hidden />
                </Button>
              </div>
            </div>
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-3">
            <NumberField label={t("km")} unit="km" value={i.km} max={60} onChange={(v) => v !== null && set({ km: v })} />
            <NumberField label={t("connectors")} unit={t("units")} value={i.connectors} integer max={40} onChange={(v) => v !== null && set({ connectors: v })} />
            <NumberField label={t("splices")} unit={t("units")} value={i.splices} integer max={60} onChange={(v) => v !== null && set({ splices: v })} />
          </div>
          <details className="rounded-xl border border-white/10">
            <summary className="cursor-pointer rounded-xl p-3 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("typicalTitle")}</summary>
            <div className="grid gap-4 px-3 pb-3">
              <p className="text-xs leading-snug text-zinc-400">{t("typicalHint")}</p>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <NumberField label={t("fiberDb")} unit="dB/km" value={i.fiberDb} max={2} onChange={(v) => v !== null && set({ fiberDb: v })} />
                <NumberField label={t("connectorDb")} unit="dB" value={i.connectorDb} max={2} onChange={(v) => v !== null && set({ connectorDb: v })} />
                <NumberField label={t("spliceDb")} unit="dB" value={i.spliceDb} max={1} onChange={(v) => v !== null && set({ spliceDb: v })} />
                <NumberField label={t("marginDb")} unit="dB" value={i.marginDb} max={10} onChange={(v) => v !== null && set({ marginDb: v })} />
              </div>
              <p className="text-xs leading-snug text-zinc-400">{t(`ontHint.${i.tech}`)}</p>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <NumberField label={t("ontSensitivity")} unit="dBm" value={i.ontSensitivity} min={-40} max={0} onChange={(v) => v !== null && set({ ontSensitivity: v })} />
                <NumberField label={t("ontTx")} unit="dBm" value={i.ontTx} min={-10} max={10} onChange={(v) => v !== null && set({ ontTx: v })} />
                <NumberField label={t("ontOverload")} unit="dBm" value={i.ontOverload} min={-30} max={10} onChange={(v) => v !== null && set({ ontOverload: v })} />
              </div>
            </div>
          </details>
        </div>

        <div className="grid gap-4" aria-live="polite">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-400">{t("ratio")}</dt>
            <dd className="text-right font-mono text-zinc-100">1:{r.ratio}</dd>
            <dt className="text-zinc-400">{t("splitLoss")}</dt>
            <dd className="text-right font-mono text-zinc-100">
              {fmt(r.splitDb)} dB
              <Src id="fibermall" />
            </dd>
            <dt className="text-zinc-400">{t("fiberLoss")}</dt>
            <dd className="text-right font-mono text-zinc-100">{fmt(r.fiberDb)} dB</dd>
            <dt className="text-zinc-400">{t("connectorLoss")}</dt>
            <dd className="text-right font-mono text-zinc-100">{fmt(r.connectorDb + r.spliceDb)} dB</dd>
            <dt className="border-t border-white/10 pt-2 font-medium text-foreground">{t("total")}</dt>
            <dd className="border-t border-white/10 pt-2 text-right font-mono font-medium text-foreground">{fmt(r.total)} dB</dd>
          </dl>
          <ul className="grid gap-2">
            {r.classes.map((c) => (
              <li key={c.id} className="grid gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-foreground">
                    {c.id} · {fmt(c.budget)} dB
                  </span>
                  <span className={VERDICT[c.verdict]}>{t(`verdict.${c.verdict}`, { spare: fmt(c.spare) })}</span>
                </div>
                {c.limit && <span className="text-xs text-zinc-400">{t(`limit.${c.limit}`)}</span>}
                {c.overload && c.minLoss !== null && <span className="text-xs text-rose-300">{t("overload", { min: fmt(c.minLoss) })}</span>}
              </li>
            ))}
          </ul>
          <p className="text-sm text-zinc-100">{r.pick ? t("pick", { id: r.pick }) : t("pickNone")}</p>
          {r.ratio > 128 && i.tech === "gpon" && <p className="text-sm text-amber-200">{t("over128")}</p>}
        </div>
      </div>
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
