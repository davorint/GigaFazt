"use client"

import { useTranslations } from "next-intl"
import { FAN_TRAYS, chassisName, type Family, CHASSIS } from "@/lib/olt-kb"
import { Src } from "./Src"

const COLS = ["chassis", "code", "fans", "place", "size", "weight", "power", "next"] as const

/** The fan tray of each chassis: what to order, how many fans, where the air goes, size, weight and power. */
export function OltFans() {
  const t = useTranslations("olt.fans")
  const familyOf = (id: string): Family => CHASSIS.find((c) => c.id === id)?.family ?? "ma5600"
  return (
    <div className="grid gap-6">
      {(["ma5600", "ma5800"] as const).map((family) => {
        const rows = FAN_TRAYS.filter((f) => familyOf(f.chassis) === family)
        return (
          <div key={family} className="grid gap-3">
            <h3 className="text-base font-medium text-foreground">{t(`family.${family}`)}</h3>
            <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption", { family: t(`family.${family}`) })}>
              <table className="w-full min-w-[64rem] text-left text-sm">
                <caption className="sr-only">{t("caption", { family: t(`family.${family}`) })}</caption>
                <thead className="text-xs text-zinc-400">
                  <tr className="border-b border-white/10">
                    {COLS.map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                        {t(`cols.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={`${f.chassis}-${f.code}`} className="border-b border-white/5 align-top last:border-0">
                      <th scope="row" className="px-3 py-2.5 font-normal whitespace-nowrap text-zinc-100">
                        {chassisName(f.chassis)}
                      </th>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-zinc-100">{f.code}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">
                        {f.fans.v}
                        <Src id={f.fans.src} />
                      </td>
                      <td className="min-w-56 px-3 py-2.5 text-zinc-300">{t(`place.${f.place.v}`)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">{f.dimensions.v} mm</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">{f.weight.v}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">
                        {f.power.v}
                        <Src id={f.power.src} />
                      </td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-zinc-300">{f.replacedBy ? `→ ${f.replacedBy.v}` : t("current")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("notesTitle")}</h3>
        <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-300">
          {(t.raw("notes") as string[]).map((x, k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden className="text-zinc-600">
                ·
              </span>
              {x}
            </li>
          ))}
        </ul>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("note")}</p>
      </div>
    </div>
  )
}
