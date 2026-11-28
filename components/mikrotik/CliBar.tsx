"use client"

import { useId, useMemo } from "react"
import { useTranslations } from "next-intl"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { indexExport, type CliMode } from "@/lib/mikrotik/cli"
import { Choice } from "./Choice"
import { useCli } from "./CliContext"
import { ViewChoice } from "./ViewChoice"

/** The scripts page's output choice: scripts or CLI commands, a new or a configured router (with its export). */
export function CliBar() {
  const t = useTranslations("mikrotik.cli")
  const cli = useCli()
  const id = useId()
  const text = cli?.exportText ?? ""
  const items = useMemo(() => (text.trim() ? indexExport(text).items.length : 0), [text])
  if (!cli) return null

  return (
    <section id="formato" data-section="mk-cli" aria-labelledby={`${id}-title`} className="surface mt-8 grid min-w-0 gap-4 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="text-sm font-medium text-foreground">
          {t("bar.title")}
        </h2>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("bar.lead")}</p>
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <ViewChoice />
        {cli.view === "cli" && (
          <div className="grid gap-1.5">
            <p className="font-mono text-xs text-zinc-300">{t("bar.router")}</p>
            <Choice<CliMode>
              label={t("bar.router")}
              value={cli.mode}
              onChange={cli.setMode}
              options={[
                { value: "new", label: t("bar.modes.new") },
                { value: "existing", label: t("bar.modes.existing") },
              ]}
            />
          </div>
        )}
      </div>

      {cli.view === "cli" && (
        <>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t(`bar.modeHint.${cli.mode}`)}</p>
          {cli.mode === "existing" && (
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-export`} className="font-mono text-xs text-zinc-300">
                {t("bar.export")}
              </label>
              <Textarea
                id={`${id}-export`}
                value={cli.exportText}
                onChange={(e) => cli.setExportText(e.target.value)}
                rows={5}
                spellCheck={false}
                autoComplete="off"
                placeholder="/export"
                aria-describedby={`${id}-export-hint`}
                className="max-h-80 overflow-y-auto font-mono text-base md:text-xs"
              />
              <p id={`${id}-export-hint`} className="text-xs leading-snug text-zinc-400">
                {cli.exportText.trim() ? t("bar.exportRead", { count: items }) : t("bar.exportHint")}
              </p>
            </div>
          )}
          <ul className="grid max-w-3xl gap-1.5 text-xs leading-relaxed text-zinc-400">
            {(t.raw("bar.tips") as string[]).map((n, k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden className="text-zinc-600">
                  ·
                </span>
                {n}
              </li>
            ))}
          </ul>
          {cli.doneCount > 0 && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={cli.clearDone}>
                <RotateCcw aria-hidden />
                {t("bar.clearDone", { count: cli.doneCount })}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
