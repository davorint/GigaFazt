"use client"

import { useTranslations } from "next-intl"
import { sourceOf } from "@/lib/olt-kb"

/** Small tag that says where a value comes from; links to its entry in Fuentes. */
export function Src({ id }: { id: string }) {
  const t = useTranslations("olt")
  const s = sourceOf(id)
  if (!s) return null
  const huawei = s.kind === "huawei"
  return (
    <a
      href={`#fuente-${s.id}`}
      title={s.title}
      className={`ml-1.5 inline-block rounded border px-1 py-px align-middle font-mono text-[10px] leading-none tracking-wide no-underline ${
        huawei ? "border-cyan-400/30 text-cyan-300" : "border-amber-400/30 text-amber-300"
      }`}
    >
      {huawei ? t("intro.huawei") : t("intro.reseller")}
    </a>
  )
}
