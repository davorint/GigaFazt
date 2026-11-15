"use client"

import { useTranslations } from "next-intl"

const COLS = ["simple", "ppp", "pcq"] as const
const ROWS = ["how", "burst", "limitAt", "stats", "cpu", "change", "auth", "fasttrack"] as const

/** How each provisioning method behaves, side by side, to help pick one. */
export function MethodGuide() {
  const t = useTranslations("mikrotik.bulk.guide")
  return (
    <details open className="surface rounded-xl">
      <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5">
        {t("title")}
      </summary>
      <div className="grid min-w-0 gap-4 px-4 pb-5 sm:px-5">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("lead")}</p>
        <div className="overflow-x-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label={t("title")}>
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                <th scope="col" className="w-40 px-3 py-2.5 font-normal">
                  <span className="sr-only">{t("aspect")}</span>
                </th>
                {COLS.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2.5 font-medium text-zinc-200">
                    {t(`cols.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top text-xs leading-relaxed text-zinc-300">
              {ROWS.map((r) => (
                <tr key={r} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal text-zinc-400">
                    {t(`rows.${r}.label`)}
                  </th>
                  {COLS.map((c) => (
                    <td key={c} className="px-3 py-2.5">
                      {t(`rows.${r}.${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-zinc-500">{t("note")}</p>
      </div>
    </details>
  )
}
