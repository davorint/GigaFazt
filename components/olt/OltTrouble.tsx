"use client"

import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { DOWN_CAUSES, TROUBLE } from "@/lib/olt-kb"
import { Src } from "./Src"

/** What to check when an ONT won't come up, keeps dropping, a whole port goes down, or the light is low. */
export function OltTrouble() {
  const t = useTranslations("olt.trouble")
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 lg:grid-cols-2">
        {TROUBLE.map((c) => (
          <details key={c.id} className="group rounded-xl border border-white/10" open={c.id === "offline"}>
            <summary className="cursor-pointer rounded-xl p-4 text-base font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {t(`cases.${c.id}.title`)}
            </summary>
            <ol className="grid gap-3 px-4 pb-4">
              {c.steps.map((s, k) => (
                <li key={s.id} className="grid gap-2">
                  <p className="text-sm leading-relaxed text-zinc-300">
                    <span className="mr-2 font-mono text-xs text-zinc-400">{String(k + 1).padStart(2, "0")}</span>
                    {t(`cases.${c.id}.steps.${s.id}`)}
                    <Src id={s.src} />
                  </p>
                  {s.cmd && (
                    <div className="grid justify-items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      {/* Wraps instead of scrolling: a scroll box would need its own keyboard stop. */}
                      <pre className="[font-variant-ligatures:none] w-full min-w-0 rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 [overflow-wrap:anywhere]">{s.cmd}</pre>
                      <CopyButton text={s.cmd} label={t("copy")} done={t("copied")} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>

      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("causesTitle")}</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("causesTitle")}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{t("causesTitle")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("cols.cause")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("cols.means")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("cols.alarm")}
                </th>
              </tr>
            </thead>
            <tbody>
              {DOWN_CAUSES.map((c) => (
                <tr key={c.key} className="border-t border-white/5 align-top text-zinc-200">
                  <th scope="row" className="px-3 py-2.5 font-mono text-xs font-medium text-foreground">
                    {c.label}
                  </th>
                  <td className="px-3 py-2.5">
                    {t(`causes.${c.key}`)}
                    <Src id={c.src} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {c.alarm ? (
                      <>
                        {c.alarm.v}
                        <Src id={c.alarm.src} />
                      </>
                    ) : (
                      <span className="font-sans text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
