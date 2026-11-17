"use client"

import { useId, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Textarea } from "@/components/ui/textarea"
import { MODULES, moduleSteps, type Module } from "@/lib/mikrotik/bundle"
import { advContext, guideScripts } from "@/lib/mikrotik/guide-scripts"
import { inspectExport, type PartReport, type PartSpec } from "@/lib/mikrotik/inspect"
import type { LabState } from "@/lib/mikrotik/state"
import { CodeBlock } from "./CodeBlock"

/** What each expert script needs on the router besides the base. */
const NEEDS: Partial<Record<Module, string[]>> = {
  failover: ["base", "balance"],
  destinos: ["base", "balance"],
  prioridad: ["base", "balance"],
  ippublica: ["base", "balance"],
  respaldo: ["base"],
  morosos: ["base"],
  dns: ["base"],
  filtros: ["base"],
  uso: ["base"],
  velocidad: ["base"],
  escudo: ["base"],
  monitoreo: ["base"],
  alertas: ["base"],
}

const TONE: Record<PartReport["state"], string> = {
  absent: "text-zinc-400",
  ok: "text-emerald-300",
  incomplete: "text-amber-200",
  duplicated: "text-red-300",
  outdated: "text-amber-200",
}

/**
 * "¿Qué tiene este router?": paste the router's `/export terse` and see, part by part, what's installed, complete,
 * duplicated or from older settings, and what's missing underneath. Read in the browser only, never saved.
 */
export function InstalledPanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik.installed")
  const ta = useTranslations("mikrotik.advanced")
  const id = useId()
  const [text, setText] = useState("")
  const specs = useMemo((): PartSpec[] => {
    const g = guideScripts(state)
    const ctx = advContext(state)
    const join = (ids: string[]) => g.steps.filter((s) => ids.includes(s.id)).map((s) => s.script).join("\n")
    return [
      { id: "base", prefix: "DS: ", script: join(["base", "pppoe", "cgnat", "hardening", "ops"]), loose: true },
      { id: "balance", prefix: "LB: ", script: join(["balance"]), needs: ["base"], loose: true },
      ...MODULES.map((mod): PartSpec => {
        const m = moduleSteps(mod, ctx, state.advanced)
        return { id: mod, prefix: `DSX ${mod === "ippublica" ? "ip-publica" : mod}: `, script: m.ok ? m.steps.map((s) => s.script).join("\n") : "", needs: NEEDS[mod] }
      }),
    ]
  }, [state])
  const reports = useMemo(() => (text.trim() ? inspectExport(text, specs) : []), [text, specs])
  const name = (part: string) => (part === "base" || part === "balance" ? t(`parts.${part}`) : ta(`modules.${part}.name`))
  const shown = reports.filter((r) => r.state !== "absent" || r.id === "base" || r.id === "balance" || state.advanced.on.includes(r.id))

  return (
    <div className="surface grid min-w-0 gap-5 rounded-2xl p-5 sm:p-7">
      <ol className="grid max-w-3xl gap-1.5 text-sm leading-relaxed text-zinc-300">
        {(t.raw("how") as string[]).map((x, k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden className="font-mono text-xs text-zinc-400">
              {String(k + 1).padStart(2, "0")}
            </span>
            {x}
          </li>
        ))}
      </ol>
      <CodeBlock code="/export terse" label={t("command")} />
      <div className="grid gap-1.5">
        <label htmlFor={id} className="font-mono text-xs text-zinc-300">
          {t("paste")}
        </label>
        <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} autoComplete="off" aria-describedby={`${id}-hint`} className="font-mono text-xs" />
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {t("pasteHint")}
        </p>
      </div>
      {text.trim() && (
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {(["part", "state", "detail"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal">
                    {t(`cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody aria-live="polite">
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top last:border-0">
                  <th scope="row" className="px-3 py-2.5 font-normal text-zinc-100">
                    {name(r.id)}
                  </th>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${TONE[r.state]}`}>{t(`states.${r.state}`)}</td>
                  <td className="grid gap-1 px-3 py-2.5 text-xs leading-snug text-zinc-300">
                    {r.state !== "absent" && <span>{t("count", { found: r.found, expected: r.expected })}</span>}
                    {r.missing.length > 0 && <span>{t("missing", { list: r.missing.slice(0, 4).join(" · "), more: Math.max(0, r.missing.length - 4) })}</span>}
                    {r.duplicated.length > 0 && <span>{t("duplicated", { list: r.duplicated.slice(0, 4).join(" · ") })}</span>}
                    {r.extra.length > 0 && <span>{t("extra", { list: r.extra.slice(0, 4).join(" · ") })}</span>}
                    {r.needs.length > 0 && <span className="text-red-300">{t("needs", { list: r.needs.map(name).join(", ") })}</span>}
                    {r.state === "absent" && <span>{t("absentHint")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
