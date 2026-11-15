"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { BRIDGE_FIREWALL, FASTTRACK_CHECK } from "@/lib/mikrotik/routeros"
import { CopyButton } from "./CopyButton"

/**
 * Two router settings that silently stop queues from limiting anything. The
 * full box lives in Exportar (id `antes-de-pegar`); other exports show the
 * compact line that links to it.
 */
export function SetupChecks({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("mikrotik.setup")
  const te = useTranslations("mikrotik.export")

  if (compact) {
    return (
      <p className="flex gap-2.5 text-sm leading-snug text-zinc-300">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <span>
          {t("compact")}{" "}
          <a href="#antes-de-pegar" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("compactLink")}
          </a>
        </span>
      </p>
    )
  }

  const items = [
    { k: "fasttrack", cmd: FASTTRACK_CHECK },
    { k: "bridge", cmd: BRIDGE_FIREWALL },
  ] as const

  return (
    <div id="antes-de-pegar" className="grid scroll-mt-20 gap-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 sm:p-5">
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
              {/* Scrolls sideways on phones instead of breaking the command mid-word. */}
              <code
                tabIndex={0}
                className="max-w-full min-w-0 overflow-x-auto rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs whitespace-nowrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {cmd}
              </code>
              <CopyButton text={cmd} label={te("copy")} done={te("copied")} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
