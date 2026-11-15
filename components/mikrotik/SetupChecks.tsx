"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { BRIDGE_FIREWALL, FASTTRACK_CHECK } from "@/lib/mikrotik/routeros"
import { CopyButton } from "./CopyButton"

/** Two router settings that silently stop queues from limiting anything. */
export function SetupChecks() {
  const t = useTranslations("mikrotik.setup")
  const te = useTranslations("mikrotik.export")
  const items = [
    { k: "fasttrack", cmd: FASTTRACK_CHECK },
    { k: "bridge", cmd: BRIDGE_FIREWALL },
  ] as const

  return (
    <div className="grid gap-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <AlertTriangle aria-hidden className="size-4 shrink-0" />
        {t("title")}
      </p>
      <ul className="grid gap-4">
        {items.map(({ k, cmd }) => (
          <li key={k} className="grid min-w-0 gap-2">
            <p className="text-sm leading-relaxed text-zinc-200">
              <span className="font-medium text-foreground">{t(`${k}.title`)}</span> {t(`${k}.body`)}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="min-w-0 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs break-all text-zinc-100">{cmd}</code>
              <CopyButton text={cmd} label={te("copy")} done={te("copied")} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
