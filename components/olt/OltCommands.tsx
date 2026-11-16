"use client"

import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { COMMANDS } from "@/lib/olt-kb"
import { Src } from "./Src"

/** The OLT commands this base and /mikrotik rely on, each with what it's for and where it comes from. */
export function OltCommands() {
  const t = useTranslations("olt.commands")
  return (
    <div className="grid gap-6">
      {(["check", "ont", "save"] as const).map((g) => (
        <div key={g} className="grid gap-3">
          <h3 className="text-base font-medium text-foreground">{t(`groups.${g}`)}</h3>
          <ul className="grid gap-3">
            {COMMANDS.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="grid gap-2 rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">
                    {t(`items.${c.id}`)}
                    <Src id={c.src} />
                  </p>
                  <CopyButton text={c.cmd} label={t("copy")} done={t("copied")} />
                </div>
                {/* Wraps instead of scrolling: a scroll box would need its own keyboard stop. */}
                <pre className="rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 [overflow-wrap:anywhere]">{c.cmd}</pre>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
