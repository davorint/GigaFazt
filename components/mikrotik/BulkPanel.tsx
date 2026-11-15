"use client"

import { useId, useState } from "react"
import { AlertTriangle, KeyRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ruleId } from "@/lib/mikrotik/burst"
import { BULK_METHODS, bulkScript, fillPasswords, MAX_ROWS, parseBulk, randomPassword, type BulkMethod } from "@/lib/mikrotik/bulk"
import { fmtNum } from "@/lib/mikrotik/format"
import { PRESETS, type LabState } from "@/lib/mikrotik/state"
import { Choice } from "./Choice"
import { CodeBlock } from "./CodeBlock"
import { SetupChecks } from "./SetupChecks"
import { TextField } from "./TextField"

const KNOWN = PRESETS.map((p) => ({ id: p.id, mbps: p.downMbps }))
const MAX_LISTED = 8

/** A pasted client list → one RouterOS script. Parsed in the browser only, never in the share link. */
export function BulkPanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik")
  const id = useId()
  const [method, setMethod] = useState<BulkMethod>("simple")
  const [text, setText] = useState("")
  const [parent, setParent] = useState("")

  const parsed = parseBulk(text, method, KNOWN)
  const script = bulkScript(parsed.rows, method, { rule: state.rule, parent })
  const missing = parsed.errors.filter((e) => e.code === "password").length
  const rid = ruleId(state.rule)
  const ruleName = rid === "custom" ? t("compare.ownRule") : t(`params.rules.${rid}`)

  return (
    <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-2">
        <p className="font-mono text-xs text-zinc-300">{t("bulk.method")}</p>
        <Choice label={t("bulk.method")} value={method} onChange={setMethod} options={BULK_METHODS.map((m) => ({ value: m, label: t(`bulk.methods.${m}`) }))} />
        <p className="max-w-3xl text-xs text-zinc-400">{t(`bulk.methodHint.${method}`)}</p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={id} className="font-mono text-xs text-zinc-300">
          {t("bulk.label")}
        </label>
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(`bulk.placeholder.${method}`)}
          spellCheck={false}
          autoComplete="off"
          rows={6}
          aria-describedby={`${id}-hint`}
          className="min-h-36 bg-white/[0.03] font-mono text-sm md:text-xs"
        />
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {t(`bulk.columns.${method}`)} {t("bulk.privacy")}
        </p>
      </div>

      <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <TextField label={t(method === "simple" ? "bulk.parent" : "bulk.parentQueue")} value={parent} onChange={setParent} hint={t("bulk.parentHint")} />
      </div>

      {text.trim() !== "" && (
        <div className="grid gap-3" aria-live="polite">
          <p className="text-sm text-zinc-200">
            {t("bulk.read", { count: parsed.rows.length, rule: ruleName })}
            {parsed.header && ` ${t("bulk.header")}`}
          </p>
          {parsed.errors.length > 0 && (
            <ul className="grid gap-1.5">
              {parsed.errors.slice(0, MAX_LISTED).map((e) => (
                <li key={`${e.line}-${e.code}`} className="flex gap-2 text-sm leading-snug text-zinc-200">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
                  {t("bulk.error", { line: e.line, reason: t(`bulk.errors.${e.code}`, { max: fmtNum(MAX_ROWS, 0) }) })}
                </li>
              ))}
              {parsed.errors.length > MAX_LISTED && (
                <li className="text-xs text-zinc-400">{t("bulk.more", { count: parsed.errors.length - MAX_LISTED })}</li>
              )}
            </ul>
          )}
          {missing > 0 && (
            <div>
              <Button type="button" variant="outline" onClick={() => setText(fillPasswords(text, method, KNOWN, () => randomPassword()))}>
                <KeyRound aria-hidden />
                {t("bulk.fill", { count: missing })}
              </Button>
            </div>
          )}
        </div>
      )}

      {script && <CodeBlock label={t(`bulk.methods.${method}`)} code={script} />}
      {script && <p className="max-w-3xl text-sm text-zinc-400">{t(`bulk.notes.${method}`)}</p>}

      <SetupChecks />
    </div>
  )
}
