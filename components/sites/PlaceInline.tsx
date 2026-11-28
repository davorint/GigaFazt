"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { InlineField } from "@/components/interno/InlineField"
import { STATES, isKnownState, municipalitiesOf, stateOf } from "@/lib/survey/places"

const OTHER = "__otro"

/**
 * State and alcaldía / municipio edited in place, with the same menus as PlaceFields: "Otro…" turns the field into
 * text; a listed municipality fills an empty state; a new state drops a municipality that isn't its own.
 */
export function PlaceInline({ state, municipality, onChange }: { state: string; municipality: string; onChange: (p: { state: string; municipality: string }) => void }) {
  const t = useTranslations("places")
  const [typeState, setTypeState] = useState(false)
  const [typeMuni, setTypeMuni] = useState(false)
  const typedState = typeState || (!!state && !isKnownState(state))
  const listed = typedState ? [] : municipalitiesOf(state)
  const typedMuni = typeMuni || !listed.length || (!!municipality && !listed.includes(municipality))
  return (
    <>
      {typedState ? (
        <InlineField kind="text" anchor="state" label={t("state")} value={state} onSave={(v) => onChange({ state: v, municipality })} />
      ) : (
        <InlineField
          kind="pick"
          anchor="state"
          label={t("state")}
          value={state}
          options={[{ value: "", label: t("none") }, ...STATES.map((s) => ({ value: s, label: s })), { value: OTHER, label: t("otherState") }]}
          onSave={(v) => {
            if (v === OTHER) return setTypeState(true)
            setTypeMuni(false)
            const keep = !municipality || (municipalitiesOf(v) as string[]).includes(municipality) || !stateOf(municipality)
            onChange({ state: v, municipality: keep ? municipality : "" })
          }}
        />
      )}
      {typedMuni ? (
        <InlineField kind="text" anchor="municipality" label={t("municipality")} value={municipality} onSave={(v) => onChange({ state: state || stateOf(v), municipality: v })} />
      ) : (
        <InlineField
          kind="pick"
          anchor="municipality"
          label={t("municipality")}
          value={municipality}
          options={[{ value: "", label: t("none") }, ...listed.map((m) => ({ value: m, label: m })), { value: OTHER, label: t("otherMunicipality") }]}
          onSave={(v) => (v === OTHER ? setTypeMuni(true) : onChange({ state: state || stateOf(v), municipality: v }))}
        />
      )}
    </>
  )
}
