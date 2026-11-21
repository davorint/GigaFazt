"use client"

import { useTranslations } from "next-intl"
import { CATALOG, GROUPS } from "@/lib/davorolt/catalog"
import { Settings } from "./DavorOltParts"
import { useOltSettings } from "./useOltSettings"

/**
 * /interno/software/davorolt (owner, 2026-11-21: "an individual tool per topic"): the OLT's data, then every tool in the
 * owner's order, each a link to its own page.
 */
export function DavorOltIndex() {
  const t = useTranslations("davorolt")
  const { settings, persisted, loaded, fresh } = useOltSettings()
  if (!loaded) return null
  return (
    <div className="mt-6 grid gap-8">
      <div id="datos">
        <Settings t={t} s={settings} persisted={persisted} open={fresh} />
      </div>
      <section aria-labelledby="dvo-index" className="grid gap-6">
        <div className="grid gap-1">
          <h2 id="dvo-index" className="text-2xl font-light text-foreground">
            {t("index.title")}
          </h2>
          <p className="text-sm text-zinc-400">{t("index.count", { n: CATALOG.length })}</p>
        </div>
        {GROUPS.map((g) => (
          <section key={g} aria-labelledby={`dvo-${g}`} className="grid gap-2">
            <h3 id={`dvo-${g}`} className="font-mono text-xs tracking-wide text-zinc-400 uppercase">
              {t(`groups.${g}`)}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {CATALOG.filter((c) => c.group === g).map((c) => (
                <li key={c.id}>
                  <a
                    href={`/interno/software/davorolt/${c.slug}`}
                    className="grid h-full gap-1 rounded-xl border border-white/10 p-3 outline-none hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="text-sm text-zinc-100">{t(`tools.${c.id}.name`)}</span>
                    <span className="text-xs leading-snug text-zinc-400">{t(`tools.${c.id}.desc`)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
      <p className="text-xs leading-relaxed text-zinc-400">{t("source")}</p>
    </div>
  )
}
