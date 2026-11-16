"use client"

import { useTranslations } from "next-intl"
import { ONTS, type Fact, type Ont } from "@/lib/olt-kb"
import { Src } from "./Src"

const ROWS = ["pon", "ports", "wifi", "rates", "optics", "power", "size"] as const satisfies readonly (keyof Ont)[]

/** Huawei's Wi-Fi 7 ONTs and the Wi-Fi 6 one, side by side: what each needs from the OLT and what it gives the client. */
export function OltOnts() {
  const t = useTranslations("olt.onts")
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-white/10">
              <th scope="col" className="w-36 px-3 py-2.5 text-xs font-normal text-zinc-400">
                {t("model")}
              </th>
              {ONTS.map((o) => (
                <th key={o.model} scope="col" className="px-3 py-2.5 align-bottom font-mono font-medium text-foreground">
                  {o.model}
                  {o.ours && <span className="mt-1 block font-sans text-xs font-normal text-emerald-300">{t("ours")}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row} className="border-t border-white/5 align-top text-zinc-200">
                <th scope="row" className="px-3 py-2.5 text-xs font-normal text-zinc-400">
                  {t(`rows.${row}`)}
                </th>
                {ONTS.map((o) => {
                  const f = o[row] as Fact
                  return (
                    <td key={o.model} className="px-3 py-2.5">
                      {f.v}
                      <Src id={f.src} />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t border-white/5 align-top text-zinc-200">
              <th scope="row" className="px-3 py-2.5 text-xs font-normal text-zinc-400">
                {t("rows.olt")}
              </th>
              {ONTS.map((o) => (
                <td key={o.model} className="px-3 py-2.5 text-zinc-300">
                  {t(`olt.${o.pon.v.startsWith("XGS") ? "xgs" : "gpon"}`)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="grid max-w-3xl gap-1.5 text-sm leading-relaxed text-zinc-300">
        {(t.raw("notes") as string[]).map((x, k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden className="text-zinc-600">
              ·
            </span>
            {x}
          </li>
        ))}
      </ul>
    </div>
  )
}
