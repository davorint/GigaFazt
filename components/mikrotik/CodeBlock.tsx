"use client"

import { useTranslations } from "next-intl"
import { CopyButton } from "./CopyButton"

/** RouterOS text with a copy button. Wraps between parameters only, never inside a key=value. */
export function CodeBlock({ code, label }: { code: string; label: string }) {
  const t = useTranslations("mikrotik.export")
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-zinc-400">{label}</p>
        <CopyButton text={code} label={t("copy")} done={t("copied")} />
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="[font-variant-ligatures:none] max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <code>
          {code.split("\n").map((line, i) => (
            <span key={i} className="block">
              {line.split(" ").map((token, j) => (
                <span key={j}>
                  {j > 0 && " "}
                  <span className="whitespace-nowrap">{token}</span>
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
