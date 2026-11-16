"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { CHASSIS } from "@/lib/olt-kb"

/** Modified MA5608T frames sold with MA5800 control boards: what changes, what to ask, what to test (owner, 2026-11-16). */
export function ModifiedChassis() {
  const t = useTranslations("olt.modified")
  const ma5608t = CHASSIS.find((c) => c.id === "ma5608t")
  const x2 = CHASSIS.find((c) => c.id === "ma5800-x2")
  const v = (k: string) => t(`values.${k}`)
  // Official columns read from the knowledge base where it has the value; the modified column is what to ask.
  const rows: { key: string; a: string; b: string; mod: string }[] = [
    { key: "depth", a: v("depth608"), b: v("depthX2"), mod: v("modDepth") },
    { key: "boardDepth", a: v("boardDepth608"), b: v("boardDepthX2"), mod: t("ask") },
    { key: "backplane", a: ma5608t?.backplane?.v ?? "", b: x2?.backplane?.v ?? "", mod: v("modBackplane") },
    { key: "controlSlots", a: ma5608t?.controlSlots.v ?? "", b: x2?.controlSlots.v ?? "", mod: t("ask") },
    { key: "controlBoards", a: (ma5608t?.controlBoards ?? []).join(", "), b: (x2?.controlBoards ?? []).join(", "), mod: v("modControl") },
    { key: "serviceBoards", a: v("serviceBoards608"), b: v("serviceBoardsX2"), mod: v("modService") },
    { key: "powerBoards", a: (ma5608t?.powerBoards ?? []).join(", "), b: (x2?.powerBoards ?? []).join(", "), mod: v("modPower") },
    { key: "software", a: v("software608"), b: v("softwareX2"), mod: v("modSoftware") },
    { key: "support", a: v("supportYes"), b: v("supportYes"), mod: v("modSupport") },
  ]
  const claims = t.raw("claims") as string[]
  return (
    <div className="grid gap-6">
      <p className="flex max-w-3xl gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 text-sm leading-relaxed text-zinc-200">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <span>{t("warning")}</span>
      </p>

      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("compareTitle")}</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                <th scope="col" className="px-3 py-2.5 font-normal">
                  <span className="sr-only">{t("caption")}</span>
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("cols.ma5608t")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal">
                  {t("cols.x2")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-normal text-amber-300">
                  {t("cols.mod")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-white/5 align-top">
                  <th scope="row" className="w-44 px-3 py-2.5 text-xs font-normal text-zinc-400">
                    {t(`rows.${r.key}`)}
                  </th>
                  <td className="px-3 py-2.5 leading-snug text-zinc-200">{r.a}</td>
                  <td className="px-3 py-2.5 leading-snug text-zinc-200">{r.b}</td>
                  <td className="px-3 py-2.5 leading-snug text-amber-100">{r.mod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{t("insight")}</p>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("sourceNote")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface grid content-start gap-3 rounded-xl p-5">
          <h3 className="text-base font-medium text-foreground">{t("claimsTitle")}</h3>
          <p className="text-sm text-zinc-400">{t("claimsLead")}</p>
          <pre className="[font-variant-ligatures:none] overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-200">{claims.join("\n")}</pre>
          <div>
            <CopyButton text={claims.join("\n")} label={t("copy")} done={t("copied")} />
          </div>
        </div>
        <div className="surface grid content-start gap-3 rounded-xl p-5">
          <h3 className="text-base font-medium text-foreground">{t("testTitle")}</h3>
          <ol className="grid list-decimal gap-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-500">
            {(t.raw("test") as string[]).map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
