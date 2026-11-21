"use client"

import { useTranslations } from "next-intl"
import { CATALOG } from "@/lib/davorolt/catalog"
import { toolById } from "@/lib/davorolt/tools"
import { ToolForm } from "./DavorOltParts"
import { useOltSettings } from "./useOltSettings"

/**
 * One DavorOLT tool on its own page (/interno/software/davorolt/<slug>): which OLT data it uses (edited on the index),
 * its form and its commands, and the previous and next tools in the owner's order.
 */
export function DavorOltTool({ id }: { id: string }) {
  const t = useTranslations("davorolt")
  const { settings: s, loaded } = useOltSettings()
  const tool = toolById(id)
  if (!loaded || !tool) return null
  const k = CATALOG.findIndex((c) => c.id === id)
  const prev = k > 0 ? CATALOG[k - 1] : undefined
  const next = k < CATALOG.length - 1 ? CATALOG[k + 1] : undefined
  return (
    <div className="mt-6 grid gap-6">
      <p className="rounded-xl border border-white/10 px-3 py-2 text-xs leading-relaxed text-zinc-400">
        {t("using", { name: s.sysname, vlan: s.mgmtVlan, slot: s.uplinkSlot, port: s.uplinkPort, plans: s.plans.map((p) => p.name).join(" · ") })}{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
        <a href="/interno/software/davorolt#datos" className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {t("usingEdit")}
        </a>
      </p>
      <ToolForm t={t} tool={tool} s={s} />
      <nav aria-label={t("index.title")} className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4 text-sm">
        {prev ? (
          <a href={`/interno/software/davorolt/${prev.slug}`} className="text-zinc-300 hover:text-foreground">
            ← {t(`tools.${prev.id}.name`)}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a href={`/interno/software/davorolt/${next.slug}`} className="text-right text-zinc-300 hover:text-foreground">
            {t(`tools.${next.id}.name`)} →
          </a>
        )}
      </nav>
      <p className="text-xs leading-relaxed text-zinc-400">{t("source")}</p>
    </div>
  )
}
