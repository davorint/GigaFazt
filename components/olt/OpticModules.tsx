"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Choice } from "@/components/mikrotik/Choice"
import { GPON_MODULE_BOARDS, MODULES, type Fact, type ModuleTech } from "@/lib/olt-kb"
import { Src } from "./Src"

const TECHS: ("all" | ModuleTech)[] = ["all", "gpon", "comboXg", "comboXgs"]

function V({ fact }: { fact: Fact }) {
  return (
    <>
      {fact.v}
      <Src id={fact.src} />
    </>
  )
}

/** Huawei's PON modules by part number (BOM): what to ask for when buying the optics. */
export function OpticModules() {
  const t = useTranslations("olt.modules")
  const [tech, setTech] = useState<(typeof TECHS)[number]>("all")
  const list = MODULES.filter((m) => tech === "all" || m.tech === tech)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <h3 className="text-base font-medium text-foreground">{t("title")}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("lead")}</p>
      </div>
      <Choice label={t("filter")} value={tech} onChange={setTech} options={TECHS.map((k) => ({ value: k, label: t(`techs.${k}`) }))} />
      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
        <table className="w-full min-w-[60rem] text-left text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="text-xs text-zinc-400">
            <tr className="border-b border-white/10">
              {(["bom", "model", "tech", "cls", "tx", "rx", "km", "note"] as const).map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 font-normal">
                  {t(`cols.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.bom} className="border-t border-white/5 align-top text-zinc-200">
                <th scope="row" className="px-3 py-2.5 font-mono font-medium text-foreground">
                  {m.bom}
                </th>
                <td className="px-3 py-2.5 font-mono text-xs">{m.model}</td>
                <td className="px-3 py-2.5">
                  {t(`techs.${m.tech}`)} · {m.form}
                </td>
                <td className="px-3 py-2.5">{m.cls}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <V fact={m.tx} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <V fact={m.rx} />
                </td>
                <td className="px-3 py-2.5">
                  <V fact={m.km} />
                </td>
                <td className="px-3 py-2.5 text-zinc-400">{m.note ? <V fact={m.note} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid max-w-3xl gap-1.5 text-xs leading-snug text-zinc-400">
        <li>
          {t("boards", { a: GPON_MODULE_BOARDS[0].v.join(", "), b: GPON_MODULE_BOARDS[1].v.join(", ") })}
          <Src id={GPON_MODULE_BOARDS[0].src} />
          <Src id={GPON_MODULE_BOARDS[1].src} />
        </li>
        <li>{t("combo")}</li>
        <li>{t("xfp")}</li>
        <li>
          {t("thirdParty")}
          <Src id="edgeoptic" />
          <Src id="gponModules" />
        </li>
        <li>{t("units")}</li>
      </ul>
    </div>
  )
}
