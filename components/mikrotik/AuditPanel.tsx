"use client"

import { useDeferredValue, useId, useMemo, useState } from "react"
import { AlertTriangle, CircleX, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ruleId } from "@/lib/mikrotik/burst"
import { auditExport, EXPORT_COMMANDS, FLAG_LEVEL, migrationScript, type AuditEntry, type AuditFlag } from "@/lib/mikrotik/audit"
import { fmtNum, fmtPct } from "@/lib/mikrotik/format"
import { rosRate } from "@/lib/mikrotik/routeros"
import { PRESETS, type LabState } from "@/lib/mikrotik/state"
import { speedLabel } from "@/lib/format"
import { CodeBlock } from "./CodeBlock"
import { SetupChecks } from "./SetupChecks"

const KNOWN = PRESETS.map((p) => ({ id: p.id, mbps: p.downMbps }))
const MAX_ROWS_SHOWN = 200
const ICON = { error: CircleX, warn: AlertTriangle, info: Info } as const
const TONE = { error: "text-red-300", warn: "text-amber-300", info: "text-zinc-400" } as const

/** Paste the router's export: every queue with its plan, rule and problems, and the commands to move it to the current rule. */
export function AuditPanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik")
  const id = useId()
  const [text, setText] = useState("")
  const [onlyIssues, setOnlyIssues] = useState(false)
  const deferred = useDeferredValue(text)
  const { rule } = state

  const audit = useMemo(() => auditExport(deferred, { plans: KNOWN, rule }), [deferred, rule])
  const migration = useMemo(() => migrationScript(audit.entries, { plans: KNOWN, rule }), [audit, rule])
  const rid = ruleId(rule)
  const ruleName = rid === "custom" ? t("compare.ownRule") : t(`params.rules.${rid}`)

  const problems = (e: AuditEntry) => e.flags.some((f) => FLAG_LEVEL[f] !== "info")
  const withProblems = audit.entries.filter(problems).length
  const recognized = audit.entries.filter((e) => e.planMbps !== null).length
  const shown = (onlyIssues ? audit.entries.filter(problems) : audit.entries).slice(0, MAX_ROWS_SHOWN)
  const total = onlyIssues ? withProblems : audit.entries.length

  const ruleText = (e: AuditEntry) => {
    if (!e.rule) return "—"
    if (e.rule.threshold === 0) return t("bulk.audit.ruleFlat", { sustained: fmtPct(e.rule.sustained) })
    return t("bulk.audit.ruleLine", { sustained: fmtPct(e.rule.sustained), threshold: fmtPct(e.rule.threshold), time: e.rule.burstTime })
  }
  const flag = (f: AuditFlag) => t(`bulk.audit.flags.${f}`, { rule: ruleName })

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t("bulk.audit.lead")}</p>
        <CodeBlock label={t("bulk.audit.commands")} code={EXPORT_COMMANDS.join("\n")} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={id} className="font-mono text-xs text-zinc-300">
          {t("bulk.audit.label")}
        </label>
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("bulk.audit.placeholder")}
          spellCheck={false}
          autoComplete="off"
          rows={6}
          aria-describedby={`${id}-hint`}
          className="min-h-36 bg-white/[0.03] font-mono text-sm md:text-xs"
        />
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {t("bulk.privacy")}
        </p>
      </div>

      {text.trim() !== "" && (
        <>
          <p className="text-sm text-zinc-200" aria-live="polite">
            {t("bulk.audit.summary", { count: audit.entries.length, recognized, problems: withProblems })}
            {audit.unreadable > 0 && ` ${t("bulk.audit.unreadable", { count: audit.unreadable })}`}
          </p>

          {audit.entries.length > 0 && (
            <div className="grid min-w-0 gap-3">
              <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
                <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} />
                {t("bulk.audit.onlyIssues")}
              </label>
              <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("bulk.audit.tableCaption")}>
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <caption className="sr-only">{t("bulk.audit.tableCaption")}</caption>
                  <thead className="text-xs text-zinc-400">
                    <tr className="border-b border-white/10">
                      {(["name", "kind", "plan", "values", "rule", "review"] as const).map((c) => (
                        <th key={c} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                          {t(`bulk.audit.cols.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="align-top text-xs">
                    {shown.map((e) => (
                      <tr key={`${e.kind}-${e.index}`} className="border-t border-white/5">
                        <th scope="row" className="px-3 py-2.5 text-left font-mono font-normal text-foreground">
                          {e.name}
                          {e.target && <span className="block text-zinc-500">{e.target}</span>}
                        </th>
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">
                          {t(`bulk.audit.kinds.${e.kind}`)}
                          {e.direction && <span className="block text-zinc-500">{t(`params.${e.direction}`)}</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">{e.planMbps ? speedLabel(e.planMbps) : "—"}</td>
                        <td className="px-3 py-2.5 font-mono whitespace-nowrap text-zinc-300">
                          {rosRate(e.down.maxLimit)} · {e.down.burstLimit > 0 ? rosRate(e.down.burstLimit) : t("compare.noBurst")}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">{ruleText(e)}</td>
                        <td className="px-3 py-2.5">
                          {e.flags.length === 0 ? (
                            <span className="text-emerald-300">{t("bulk.audit.ok")}</span>
                          ) : (
                            <ul className="grid gap-1">
                              {e.flags.map((f) => {
                                const level = FLAG_LEVEL[f]
                                const Icon = ICON[level]
                                return (
                                  <li key={f} className="flex gap-1.5 leading-snug text-zinc-200">
                                    <Icon aria-hidden className={`mt-px size-3.5 shrink-0 ${TONE[level]}`} />
                                    <span>
                                      <span className="sr-only">{t(`issues.level.${level}`)}: </span>
                                      {flag(f)}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > MAX_ROWS_SHOWN && <p className="text-xs text-zinc-400">{t("bulk.audit.truncated", { shown: MAX_ROWS_SHOWN, total: fmtNum(total, 0) })}</p>}
            </div>
          )}

          {audit.entries.length > 0 && (
            <div className="grid min-w-0 gap-3">
              <h3 className="text-sm font-medium text-foreground">{t("bulk.audit.migrateTitle", { rule: ruleName })}</h3>
              <p className="text-sm text-zinc-300">{t("bulk.audit.migrateSummary", { changed: migration.changed, skipped: migration.skipped })}</p>
              {migration.script && <CodeBlock label={t("bulk.audit.migrateLabel")} code={migration.script} />}
              <p className="max-w-3xl text-sm text-zinc-400">{t("bulk.audit.migrateNote")}</p>
              <SetupChecks compact />
            </div>
          )}
        </>
      )}
    </div>
  )
}
