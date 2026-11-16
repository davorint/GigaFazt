"use client"

import { useTranslations } from "next-intl"
import { AC_BOARDS, CHASSIS, CHASSIS_INPUT_A, POWER_SYSTEMS, type Fact, type PowerSystem } from "@/lib/olt-kb"
import { Src } from "./Src"

function V({ fact }: { fact?: Fact<string | number> }) {
  const t = useTranslations("olt")
  if (!fact) return <span className="text-zinc-400">{t("missing")}</span>
  return (
    <>
      {fact.v}
      <Src id={fact.src} />
    </>
  )
}

const ROWS = ["rectifier", "module", "slots", "maxA", "input", "outputs", "battery", "monitor", "size", "temperature", "powers"] as const

function cell(s: PowerSystem, row: (typeof ROWS)[number]) {
  switch (row) {
    case "module":
      return (
        <>
          {s.moduleA.high.v} A
          <Src id={s.moduleA.high.src} /> / {s.moduleA.low.v} A
          <Src id={s.moduleA.low.src} />
        </>
      )
    case "slots":
      return <V fact={s.slots} />
    case "maxA":
      return (
        <>
          {s.maxA.v} A
          <Src id={s.maxA.src} />
        </>
      )
    default:
      return <V fact={s[row]} />
  }
}

/** How each chassis is fed, and the external AC → −48 V systems for the ones that only take DC. */
export function OltPower() {
  const t = useTranslations("olt.power")
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("chassisTitle")}</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("chassisTitle")}>
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">{t("chassisTitle")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {(["chassis", "boards", "input", "current", "external"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal">
                    {t(`cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHASSIS.map((c) => {
                const ac = c.powerBoards.filter((b) => AC_BOARDS[b])
                const current = CHASSIS_INPUT_A[c.id]
                return (
                  <tr key={c.id} className="border-t border-white/5 align-top text-zinc-200">
                    <th scope="row" className="px-3 py-2.5 font-medium text-foreground">
                      {c.name}
                    </th>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {c.powerBoards.map((b) => (
                        <span key={b} className="block">
                          {b} <span className="font-sans text-zinc-400">{AC_BOARDS[b] ? t("acBoard", { w: AC_BOARDS[b].v }) : t("dcBoard")}</span>
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2.5">
                      <V fact={c.power} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {current ? (
                        <>
                          {current.v} A
                          <Src id={current.src} />
                        </>
                      ) : (
                        <span className="text-zinc-400">{t("noData")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300">{ac.length ? t("externalOptional", { boards: ac.join(", ") }) : t("externalNeeded")}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("systemsTitle")}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("systemsLead")}</p>
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("systemsTitle")}>
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">{t("systemsTitle")}</caption>
            <thead>
              <tr className="border-b border-white/10">
                <th scope="col" className="w-36 px-3 py-2.5 text-xs font-normal text-zinc-400">
                  {t("rows.model")}
                </th>
                {POWER_SYSTEMS.map((s) => (
                  <th key={s.id} scope="col" className="px-3 py-2.5 font-mono font-medium text-foreground">
                    {s.id}
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
                  {POWER_SYSTEMS.map((s) => (
                    <td key={s.id} className="px-3 py-2.5">
                      {cell(s, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("adviceTitle")}</h3>
        <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-300">
          {(t.raw("advice") as string[]).map((x, k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden className="text-zinc-600">
                ·
              </span>
              {x}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
