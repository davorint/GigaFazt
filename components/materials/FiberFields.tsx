"use client"

import type { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import {
  CABLE_TYPES,
  FIBER_BUILDS,
  FIBER_JACKETS,
  FIBER_MODES,
  FIBER_PLACES,
  FIBER_STRENGTH,
  STRAND_COUNTS,
  gradesFor,
  setFiber,
  type CableType,
  type FiberBuild,
  type FiberGrade,
  type FiberJacket,
  type FiberMode,
  type FiberPlace,
  type FiberSpec,
  type FiberStrength,
} from "@/lib/materials/fiber"

type T = ReturnType<typeof useTranslations>

/** The fiber filters of the list: "" = any. */
export type FiberFilter = { mode: FiberMode | ""; grade: FiberGrade | ""; cable: CableType | ""; place: FiberPlace | "" }
export const NO_FIBER_FILTER: FiberFilter = { mode: "", grade: "", cable: "", place: "" }

/** Whether an item's fiber spec passes the filters (an unset filter passes everything). */
export const fiberMatches = (f: FiberSpec, q: FiberFilter) =>
  (!q.mode || f.mode === q.mode) && (!q.grade || f.grade === q.grade) && (!q.cable || f.cable === q.cable) && (!q.place || f.place === q.place)

/** One line for the list: "Monomodo (SM) · G.657.A2 … · Drop plano … · Exterior · 1 hilo". */
export function fiberSummary(t: T, f: FiberSpec): string {
  return [
    f.grade ? t(`fiber.grades.${f.grade}`).replace(/ \(.*\)$/, "") : f.mode ? t(`fiber.modes.${f.mode}`) : "",
    f.cable ? t(`fiber.cables.${f.cable}`).replace(/ \(.*\)$/, "") : "",
    f.place ? t(`fiber.places.${f.place}`) : "",
    f.strands ? t("fiber.summaryStrands", { n: f.strands }) : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

// The menu's labels sit under fiber.<group>.<value>; the key is built at run time, so it's looked up as a plain string.
const opts = <V extends string>(t: T, empty: string, list: readonly V[], group: string) => {
  const label = t as unknown as (key: string) => string
  return [{ value: "" as V | "", label: empty }, ...list.map((v) => ({ value: v as V | "", label: label(`fiber.${group}.${v}`) }))]
}

/** The menus of a fiber or cable item. */
export function FiberFields({ t, value: f, onChange }: { t: T; value: FiberSpec; onChange: (f: FiberSpec) => void }) {
  const none = t("fiber.none")
  const up = (p: Partial<FiberSpec>) => onChange(setFiber(f, p))
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{t("fiber.title")}</legend>
      <p className="text-xs text-zinc-400">{t("fiber.hint")}</p>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <PickField label={t("fiber.mode")} value={f.mode} onChange={(mode) => up({ mode })} options={opts(t, none, FIBER_MODES, "modes")} />
        <PickField label={t("fiber.grade")} value={f.grade} onChange={(grade) => up({ grade })} options={opts(t, none, gradesFor(f.mode), "grades")} />
        <PickField label={t("fiber.cable")} value={f.cable} onChange={(cable) => up({ cable })} options={opts(t, none, CABLE_TYPES, "cables")} />
        <PickField label={t("fiber.place")} value={f.place} onChange={(place) => up({ place })} options={opts(t, none, FIBER_PLACES, "places")} />
        <PickField
          label={t("fiber.strands")}
          value={f.strands === null ? "" : String(f.strands)}
          onChange={(v) => up({ strands: v ? Number(v) : null })}
          options={[
            { value: "", label: none },
            // A count typed elsewhere (an import) that isn't in the usual list still shows.
            ...(f.strands !== null && !(STRAND_COUNTS as readonly number[]).includes(f.strands) ? [{ value: String(f.strands), label: String(f.strands) }] : []),
            ...STRAND_COUNTS.map((n) => ({ value: String(n), label: String(n) })),
          ]}
        />
        <PickField label={t("fiber.build")} value={f.build} onChange={(build: FiberBuild | "") => up({ build })} options={opts(t, none, FIBER_BUILDS, "builds")} />
        <PickField label={t("fiber.jacket")} value={f.jacket} onChange={(jacket: FiberJacket | "") => up({ jacket })} options={opts(t, none, FIBER_JACKETS, "jackets")} />
        <PickField label={t("fiber.strength")} value={f.strength} onChange={(strength: FiberStrength | "") => up({ strength })} options={opts(t, none, FIBER_STRENGTH, "strengths")} />
      </div>
    </fieldset>
  )
}

/** The list's fiber filters (type, grade, cable, indoor/outdoor). */
export function FiberFilters({ t, value: q, onChange }: { t: T; value: FiberFilter; onChange: (q: FiberFilter) => void }) {
  const any = t("fiber.any")
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{t("fiber.filters")}</legend>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PickField label={t("fiber.mode")} value={q.mode} onChange={(mode) => onChange({ ...q, mode, grade: "" })} options={opts(t, any, FIBER_MODES, "modes")} />
        <PickField label={t("fiber.grade")} value={q.grade} onChange={(grade) => onChange({ ...q, grade })} options={opts(t, any, gradesFor(q.mode), "grades")} />
        <PickField label={t("fiber.cable")} value={q.cable} onChange={(cable) => onChange({ ...q, cable })} options={opts(t, any, CABLE_TYPES, "cables")} />
        <PickField label={t("fiber.place")} value={q.place} onChange={(place) => onChange({ ...q, place })} options={opts(t, any, FIBER_PLACES, "places")} />
      </div>
    </fieldset>
  )
}
