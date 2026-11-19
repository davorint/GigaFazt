"use client"

import type { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { PickField } from "@/components/surveys/SurveyFields"
import { decodeSpecs, fieldsOf, typesOf, type SpecCatalog, type Specs } from "@/lib/specs/engine"

type T = ReturnType<typeof useTranslations>

// Labels sit under specs.types.<type>, specs.fields.<field> and specs.options.<field>.<value>; the keys are built at run
// time, so they're looked up as plain strings.
const say = (t: T) => t as unknown as (key: string, values?: Record<string, string | number>) => string

/** One line for a list: "Caja NAP / de distribución · 16 puertos · IP68". */
export function specSummary<C extends string>(t: T, cat: SpecCatalog<C>, category: C, ptype: string, traits: Specs): string {
  if (!ptype) return ""
  const s = say(t)
  const parts = [s(`specs.types.${ptype}`)]
  for (const key of fieldsOf(cat, category, ptype)) {
    const v = traits[key]
    const f = cat.fields[key]
    if (v === undefined || !f) continue
    parts.push(f.kind === "pick" ? s(`specs.options.${key}.${v}`) : `${s(`specs.fields.${key}`)} ${v}${f.unit ? ` ${f.unit}` : ""}`)
  }
  return parts.join(" · ")
}

/** Type menu options of a category ("" first, labelled `empty`). */
export function typeOptions<C extends string>(t: T, cat: SpecCatalog<C>, category: C, empty: string) {
  const s = say(t)
  return [{ value: "", label: empty }, ...typesOf(cat, category).map((v) => ({ value: v, label: s(`specs.types.${v}`) }))]
}

/** The type menu of a product and the characteristics of the type picked. Nothing shows when the category has no types. */
export function SpecFields<C extends string>({ t, cat, category, ptype, traits, onChange }: { t: T; cat: SpecCatalog<C>; category: C; ptype: string; traits: Specs; onChange: (v: { ptype: string; traits: Specs }) => void }) {
  if (!typesOf(cat, category).length) return null
  const s = say(t)
  const none = s("specs.none")
  const set = (key: string, v: string | number | null) => {
    const next = { ...traits }
    if (v === null || v === "") delete next[key]
    else next[key] = v
    onChange({ ptype, traits: next })
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{s("specs.title")}</legend>
      <p className="text-xs text-zinc-400">{s("specs.typeHint")}</p>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <PickField label={s("specs.type")} value={ptype} onChange={(next) => onChange({ ptype: next, traits: decodeSpecs(cat, category, next, traits) })} options={typeOptions(t, cat, category, s("specs.noType"))} />
        {fieldsOf(cat, category, ptype).map((key) => {
          const f = cat.fields[key]
          if (!f) return null
          const label = s(`specs.fields.${key}`)
          const v = traits[key]
          return f.kind === "pick" ? (
            <PickField key={key} label={label} value={typeof v === "string" ? v : ""} onChange={(x) => set(key, x)} options={[{ value: "", label: none }, ...f.options.map((o) => ({ value: o, label: s(`specs.options.${key}.${o}`) }))]} />
          ) : (
            <NumberField key={key} label={label} unit={f.unit} optional integer={f.integer} min={f.min} max={f.max} precision={f.integer ? 0 : 1} value={typeof v === "number" ? v : null} onChange={(x) => set(key, x)} />
          )
        })}
      </div>
    </fieldset>
  )
}
