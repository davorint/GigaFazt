"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { GRID, PickField } from "@/components/surveys/SurveyFields"
import { STATES, isKnownState, municipalitiesOf, stateOf } from "@/lib/survey/places"

const OTHER = "__otro"

/**
 * State and alcaldía / municipio as menus (owner, 2026-11-20; surveys and deployments), each with "Otro" to type one that isn't listed. Picking a
 * listed municipality with no state chosen fills the state; changing the state clears a municipality that isn't its.
 */
export function PlaceFields({ state, municipality, onChange }: { state: string; municipality: string; onChange: (p: { state: string; municipality: string }) => void }) {
  const t = useTranslations("places")
  // "Otro" chosen but nothing typed yet: kept here so the text box stays open.
  const [otherState, setOtherState] = useState(!!state && !isKnownState(state))
  const [otherMuni, setOtherMuni] = useState(false)
  const typedState = otherState || (!!state && !isKnownState(state))
  const listed = typedState ? [] : municipalitiesOf(state)
  const typedMuni = typedState || otherMuni || (!!municipality && !listed.includes(municipality))

  const pickState = (v: string) => {
    if (v === OTHER) {
      setOtherState(true)
      return onChange({ state: "", municipality: listed.includes(municipality) ? "" : municipality })
    }
    setOtherState(false)
    const keep = !municipality || (municipalitiesOf(v) as string[]).includes(municipality) || (!stateOf(municipality) && !v)
    onChange({ state: v, municipality: keep ? municipality : "" })
  }
  const pickMuni = (v: string) => {
    if (v === OTHER) {
      setOtherMuni(true)
      return onChange({ state, municipality: "" })
    }
    setOtherMuni(false)
    onChange({ state: state || stateOf(v), municipality: v })
  }

  return (
    <div className={GRID}>
      <div className="grid gap-2">
        <PickField
          label={t("state")}
          value={typedState ? OTHER : state}
          onChange={pickState}
          options={[{ value: "", label: t("none") }, ...STATES.map((s) => ({ value: s, label: s })), { value: OTHER, label: t("otherState") }]}
        />
        {typedState && <TextField label={t("stateName")} value={state} onChange={(v) => onChange({ state: v, municipality })} />}
      </div>
      <div className="grid gap-2">
        {!typedState && (
          <PickField
            label={t("municipality")}
            value={typedMuni ? OTHER : municipality}
            onChange={pickMuni}
            options={[{ value: "", label: t("none") }, ...listed.map((m) => ({ value: m, label: m })), { value: OTHER, label: t("otherMunicipality") }]}
          />
        )}
        {typedMuni && <TextField label={typedState ? t("municipality") : t("municipalityName")} value={municipality} onChange={(v) => onChange({ state, municipality: v })} />}
      </div>
    </div>
  )
}
