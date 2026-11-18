"use client"

import { useTranslations } from "next-intl"
import { sourceOf } from "@/lib/olt-kb"

/** Small tag that says where a value comes from; links to its entry in Fuentes. */
export function Src({ id }: { id: string }) {
  const t = useTranslations("olt")
  const s = sourceOf(id)
  if (!s) return null
  const style = { huawei: "border-cyan-400/30 text-cyan-300", reseller: "border-amber-400/30 text-amber-300", standard: "border-violet-400/40 text-violet-300" }[s.kind]
  return (
    <a
      href={`#fuente-${s.id}`}
      title={s.title}
      // The tag stays small; an invisible margin around it makes it at least 24 px tall to tap.
      className={`relative ml-1.5 inline-block rounded border px-1 py-px align-middle font-mono text-[10px] leading-none tracking-wide no-underline after:absolute after:-inset-x-1 after:-inset-y-[6px] after:content-[''] ${style}`}
    >
      {t(`intro.${s.kind}`)}
    </a>
  )
}
