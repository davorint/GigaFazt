"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { SelectField } from "@/components/mikrotik/SelectField"
import { BOARDS, chassisName, type Board, type Fact } from "@/lib/olt-kb"
import { Src } from "./Src"

/** Up to three boards side by side: the fastest way to choose between two codes in a listing. */
export function BoardCompare() {
  const t = useTranslations("olt.compare")
  const tb = useTranslations("olt.boards")
  const [codes, setCodes] = useState<string[]>(["H802GPFD", "H806GPBH", ""])
  const picked = codes.map((c) => BOARDS.find((b) => b.code === c) ?? null)
  const fact = (f?: Fact<string> | Fact<string[]>): ReactNode =>
    f ? (
      <>
        {Array.isArray(f.v) ? f.v.join(", ") : f.v}
        <Src id={f.src} />
      </>
    ) : (
      <span className="text-zinc-400">{t("none")}</span>
    )
  const rows: { key: string; cell: (b: Board) => ReactNode }[] = [
    { key: "kind", cell: (b) => tb(`kinds.${b.kind}`) },
    { key: "ports", cell: (b) => fact(b.ports) },
    { key: "power", cell: (b) => fact(b.power) },
    { key: "chassis", cell: (b) => b.chassis.map(chassisName).join(", ") },
    { key: "controls", cell: (b) => fact(b.controls) },
    { key: "minVersion", cell: (b) => fact(b.minVersion) },
    { key: "lifecycle", cell: (b) => (b.lifecycle ? <span className="text-amber-200">{tb(`lifecycle.${b.lifecycle.v}`)}</span> : t("current")) },
    { key: "replacedBy", cell: (b) => fact(b.replacedBy) },
    { key: "detail", cell: (b) => fact(b.detail) },
  ]
  const groups = (["ma5600", "ma5800"] as const).map((f) => ({ f, list: BOARDS.filter((b) => b.family === f) }))

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-3">
        {codes.map((code, k) => (
          <SelectField key={k} label={t("pick", { n: k + 1 })} value={code} onChange={(v) => setCodes(codes.map((c, j) => (j === k ? v : c)))}>
            <option value="">{t("empty")}</option>
            {groups.map(({ f, list }) => (
              <optgroup key={f} label={tb(`families.${f}`)}>
                {list.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        ))}
      </div>
      {picked.some(Boolean) && (
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b border-white/10">
                <th scope="col" className="w-36 px-3 py-2.5 text-xs font-normal text-zinc-400">
                  <span className="sr-only">{t("caption")}</span>
                </th>
                {picked.map((b, k) =>
                  b ? (
                    <th key={k} scope="col" className="px-3 py-2.5 font-mono font-medium text-foreground">
                      {b.code}
                    </th>
                  ) : null
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-white/5 align-top">
                  <th scope="row" className="px-3 py-2.5 text-xs font-normal text-zinc-400">
                    {tb(`fields.${r.key}`)}
                  </th>
                  {picked.map((b, k) =>
                    b ? (
                      <td key={k} className="px-3 py-2.5 leading-snug text-zinc-200">
                        {r.cell(b)}
                      </td>
                    ) : null
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
