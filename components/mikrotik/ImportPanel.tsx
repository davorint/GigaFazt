"use client"

import { useEffect, useId, useState } from "react"
import { AlertTriangle, Check, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { burstEnabled, type QueueParams } from "@/lib/mikrotik/burst"
import { parseRouterOS } from "@/lib/mikrotik/import"
import { rosRate, rosTime } from "@/lib/mikrotik/routeros"

/** Paste RouterOS config, see what was read, apply it to the parameters. Parsed in the browser only. */
export function ImportPanel({ onApply }: { onApply: (v: { down: QueueParams; up: QueueParams }) => void }) {
  const t = useTranslations("mikrotik.import")
  const tp = useTranslations("mikrotik.params")
  const id = useId()
  const [text, setText] = useState("")
  const [applied, setApplied] = useState(false)
  const r = parseRouterOS(text)

  useEffect(() => {
    if (!applied) return
    const timer = window.setTimeout(() => setApplied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [applied])

  const line = (q: QueueParams) =>
    burstEnabled(q)
      ? t("line", {
          max: rosRate(q.maxLimit),
          burst: rosRate(q.burstLimit),
          threshold: rosRate(q.burstThreshold),
          time: rosTime(q.burstTime),
          limitAt: rosRate(q.limitAt),
        })
      : t("lineNoBurst", { max: rosRate(q.maxLimit), limitAt: rosRate(q.limitAt) })

  return (
    <details className="surface group rounded-2xl">
      <summary className="cursor-pointer rounded-2xl p-5 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-7">
        {t("title")}
      </summary>
      <div className="grid gap-4 px-5 pb-5 sm:px-7 sm:pb-7">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("lead")}</p>
        <div className="grid gap-1.5">
          <label htmlFor={id} className="font-mono text-xs text-zinc-300">
            {t("label")}
          </label>
          <Textarea
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            spellCheck={false}
            autoComplete="off"
            rows={4}
            aria-describedby={`${id}-out`}
            aria-invalid={(!r.ok && r.error !== "empty") || undefined}
            className="max-h-96 min-h-28 overflow-y-auto bg-white/[0.03] font-mono text-sm md:text-xs"
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {r.ok ? t("read", { source: t(`sources.${r.source}`) }) : r.error !== "empty" ? t(`errors.${r.error}`) : ""}
        </p>
        <div id={`${id}-out`} className="grid gap-3">
          {r.ok ? (
            <>
              <p className="text-sm text-emerald-300">{t("read", { source: t(`sources.${r.source}`) })}</p>
              <dl className="grid gap-2 font-mono text-xs leading-relaxed">
                {(["down", "up"] as const).map((d) => (
                  <div key={d} className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
                    <dt className="font-sans text-zinc-400">{tp(d)}</dt>
                    <dd className="text-zinc-100">{line(r[d])}</dd>
                  </div>
                ))}
              </dl>
              {r.notes.length > 0 && (
                <ul className="grid gap-1.5">
                  {r.notes.map((n) => (
                    <li key={n} className="flex gap-2 text-xs leading-snug text-zinc-300">
                      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                      {t(`notes.${n}`)}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    onApply({ down: r.down, up: r.up })
                    setApplied(true)
                  }}
                >
                  {applied && <Check aria-hidden />}
                  {applied ? t("applied") : t("apply")}
                </Button>
              </div>
            </>
          ) : (
            r.error !== "empty" && (
              <p className="flex gap-2 text-sm leading-snug text-zinc-200">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
                {t(`errors.${r.error}`)}
              </p>
            )
          )}
        </div>
      </div>
    </details>
  )
}
