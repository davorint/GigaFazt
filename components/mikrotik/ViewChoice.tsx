"use client"

import { useTranslations } from "next-intl"
import { Choice } from "./Choice"
import { useCli, type ScriptView } from "./CliContext"

/** Script or CLI: on the page's bar and above each output, the same choice. */
export function ViewChoice({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("mikrotik.cli")
  const cli = useCli()
  if (!cli) return null
  return (
    <div className="grid gap-1.5">
      {!compact && <p className="font-mono text-xs text-zinc-300">{t("bar.view")}</p>}
      <Choice<ScriptView>
        label={t("bar.view")}
        value={cli.view}
        onChange={cli.setView}
        options={[
          { value: "script", label: t("bar.views.script") },
          { value: "cli", label: t("bar.views.cli") },
        ]}
      />
    </div>
  )
}
