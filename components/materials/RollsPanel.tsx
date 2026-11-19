"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, PickField } from "@/components/surveys/SurveyFields"
import { ExportButton } from "@/components/interno/ExportButton"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { toCsv } from "@/lib/csv"
import { BUFFERS, CABLES, ENDS, ENVS, JACKETS, LENGTHS, MAX_COUNT, MAX_LENGTH, MODES, STRANDS, USED_STEPS, addRolls, cableDefaults, fibersFor, leftOptions, newRoll, percentLeft, rollState, rollTotals, spendMeters, type Cable, type Env, type Fiber, type Mode, type Roll, type RollSpec, type RollState } from "@/lib/rolls/model"
import { rollsStore } from "@/lib/rolls/store"
import { BODEGA } from "@/lib/stock/model"
import { readState } from "@/lib/sync/state"
import { usePlaceLabel, usePlaceOptions } from "./places"

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "h-10 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const OTHER = "otra"
const COUNTS = Array.from({ length: 20 }, (_, i) => i + 1)
type Spec = Pick<Roll, RollSpec>
const STATE_TONE: Record<RollState, string> = { llena: "text-emerald-300", "en-uso": "text-sky-300", vacia: "text-zinc-500" }

/** Fiber rolls: add several at once, what is left of each (menus, no typing), totals per kind of cable. */
export function RollsPanel() {
  const t = useTranslations("materiales.rolls")
  const rolls = useSyncExternalStore(rollsStore.subscribe, rollsStore.snapshot, rollsStore.serverSnapshot).list
  const placeLabel = usePlaceLabel()
  const placeOptions = usePlaceOptions()
  const [place, setPlace] = useState("")
  const [showEmpty, setShowEmpty] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const kindLabel = (r: { cable: Cable; strands: number; mode: Mode; fiber: Fiber; env: Env }) => `${t(`cables.${r.cable}`)} · ${t("strandsN", { n: r.strands })} · ${t(`modes.${r.mode}`)} ${t(`fibers.${r.fiber}`)} · ${t(`envs.${r.env}`)}`
  const inPlace = rolls.filter((r) => !place || r.place === place)
  const shown = inPlace.filter((r) => showEmpty || rollState(r) !== "vacia").sort((a, b) => kindLabel(a).localeCompare(kindLabel(b), "es") || b.leftM - a.leftM || a.code.localeCompare(b.code, "es", { numeric: true }))
  const totals = rollTotals(inPlace)
  const emptyCount = inPlace.filter((r) => rollState(r) === "vacia").length
  const m = (n: number) => n.toLocaleString("es-MX")

  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("intro")}</p>
      <AddRolls
        rolls={rolls}
        placeOptions={placeOptions}
        onAdded={(n) => {
          setMsg(t("added", { n }))
          setOpen(null)
        }}
      />
      {msg && (
        <p role="status" className="text-sm text-emerald-300">
          {msg}
        </p>
      )}

      <section aria-labelledby="rolls-totals" className="grid gap-3">
        <h3 id="rolls-totals" className="text-lg font-medium text-foreground">
          {t("totals")}
        </h3>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <PickField label={t("place")} value={place} onChange={setPlace} options={[{ value: "", label: t("allPlaces") }, ...placeOptions]} />
        </div>
        {!totals.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {totals.map((g) => (
            <li key={g.key} className="grid gap-1 rounded-xl border border-white/10 p-3">
              <span className="text-sm text-zinc-100">{kindLabel(g)}</span>
              <span className="font-mono text-lg text-foreground">{t("metersLeft", { m: m(g.leftM) })}</span>
              <span className="text-xs text-zinc-400">{t("groupLine", { rolls: g.rolls, full: g.full, empty: g.empty })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rolls-list" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="rolls-list" className="text-lg font-medium text-foreground">
            {t("list", { n: shown.length })}
          </h3>
          <ExportButton
            label={t("exportCsv")}
            name="bobinas"
            disabled={!rolls.length}
            build={() =>
              toCsv(
                [t("code"), t("cable"), t("strands"), t("mode"), t("fiber"), t("env"), t("jacket"), t("buffer"), t("endsLabel"), t("brand"), t("length"), t("left"), t("percent"), t("state"), t("place"), t("by"), t("notes")],
                rolls.map((r) => [r.code, t(`cables.${r.cable}`), r.strands, t(`modes.${r.mode}`), t(`fibers.${r.fiber}`), t(`envs.${r.env}`), t(`jackets.${r.jacket || "none"}`), t(`buffers.${r.buffer || "none"}`), t(`ends.${r.ends}`), r.brand, r.lengthM, r.leftM, percentLeft(r), t(`states.${rollState(r)}`), placeLabel(r.place), r.by, r.notes])
              )
            }
          />
        </div>
        {emptyCount > 0 && (
          <label className="flex w-fit items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="size-4 accent-white" />
            {t("showEmpty", { n: emptyCount })}
          </label>
        )}
        <ul className="grid gap-2">
          {shown.map((r) => (
            <RollRow key={r.id} r={r} kind={kindLabel(r)} place={placeLabel(r.place)} placeOptions={placeOptions} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </ul>
      </section>
    </div>
  )
}

/** The add form: everything from menus; the length has "Otra…" to type one. */
function AddRolls({ rolls, placeOptions, onAdded }: { rolls: Roll[]; placeOptions: { value: string; label: string }[]; onAdded: (n: number) => void }) {
  const t = useTranslations("materiales.rolls")
  const [count, setCount] = useState("1")
  const [spec, setSpec] = useState<Spec>(() => {
    const { cable, strands, mode, fiber, env, jacket, buffer, ends, brand } = newRoll()
    return { cable, strands, mode, fiber, env, jacket, buffer, ends, brand }
  })
  const [length, setLength] = useState("1000")
  const [custom, setCustom] = useState<number | null>(null)
  const [place, setPlace] = useState(BODEGA)
  const lengthM = length === OTHER ? custom : Number(length)
  const ok = lengthM !== null && lengthM > 0
  const add = () => {
    if (!ok) return
    const made = addRolls(rolls, { ...spec, brand: spec.brand.trim(), lengthM, place, by: readState().name }, Number(count))
    rollsStore.save(...made)
    onAdded(made.length)
  }
  return (
    <section aria-labelledby="rolls-add" className="grid gap-3 rounded-xl border border-white/15 bg-white/[0.02] p-4">
      <h3 id="rolls-add" className="text-base font-medium text-foreground">
        {t("add")}
      </h3>
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <PickField label={t("count")} value={count} onChange={setCount} options={COUNTS.map((n) => ({ value: String(n), label: t("countN", { n }) }))} />
        <SpecFields spec={spec} onChange={(p) => setSpec({ ...spec, ...p })} />
        <PickField label={t("length")} value={length} onChange={setLength} options={[...LENGTHS.map((n) => ({ value: String(n), label: `${n.toLocaleString("es-MX")} m` })), { value: OTHER, label: t("otherLength") }]} />
        {length === OTHER && <NumberField label={t("lengthTyped")} unit="m" value={custom} onChange={setCustom} min={1} max={MAX_LENGTH} optional />}
        <PickField label={t("place")} value={place} onChange={setPlace} options={placeOptions} />
      </div>
      <button type="button" onClick={add} disabled={!ok} className={`${PRIMARY} disabled:opacity-50`}>
        {t("addSubmit", { n: Number(count) })}
      </button>
      <p className="text-xs text-zinc-400">{t("addHint", { max: MAX_COUNT })}</p>
    </section>
  )
}

function RollRow({ r, kind, place, placeOptions, open, onToggle }: { r: Roll; kind: string; place: string; placeOptions: { value: string; label: string }[]; open: boolean; onToggle: () => void }) {
  const t = useTranslations("materiales.rolls")
  const [used, setUsed] = useState("")
  const s = rollState(r)
  const pct = percentLeft(r)
  const save = (next: Roll) => rollsStore.save(next)
  return (
    <li className="rounded-xl border border-white/10">
      <button type="button" aria-expanded={open} onClick={onToggle} className="grid w-full gap-2 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex items-start justify-between gap-3">
          <span className="grid gap-0.5">
            <span className="text-sm text-zinc-100">
              {r.code && <span className="font-mono">{r.code} · </span>}
              {kind}
            </span>
            <span className="text-xs text-zinc-400">{place}</span>
          </span>
          <span className="grid shrink-0 justify-items-end gap-0.5">
            <span className="font-mono text-sm text-zinc-100">{t("leftOf", { left: r.leftM.toLocaleString("es-MX"), length: r.lengthM.toLocaleString("es-MX") })}</span>
            <span className={`text-xs ${STATE_TONE[s]}`}>{t(`states.${s}`)}</span>
          </span>
        </span>
        <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${pct}%` }} />
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-white/10 p-3">
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <PickField
              label={t("used")}
              value={used}
              onChange={(v) => {
                setUsed("")
                if (v) save(spendMeters(r, Number(v)))
              }}
              hint={t("usedHint")}
              options={[{ value: "", label: t("usedPick") }, ...USED_STEPS.filter((n) => n <= r.leftM).map((n) => ({ value: String(n), label: t("usedN", { n }) }))]}
            />
            <PickField
              label={t("left")}
              value={String(r.leftM)}
              onChange={(v) => save({ ...r, leftM: Number(v) })}
              options={leftOptions(r).map((n) => ({ value: String(n), label: t("leftOption", { m: n.toLocaleString("es-MX"), p: r.lengthM ? Math.round((n / r.lengthM) * 100) : 0 }) }))}
            />
            <NumberField label={t("leftTyped")} unit="m" value={r.leftM} onChange={(v) => v !== null && save({ ...r, leftM: Math.min(v, r.lengthM) })} min={0} max={r.lengthM} />
            <PickField label={t("place")} value={r.place} onChange={(p) => save({ ...r, place: p })} options={placeOptions} />
            <SpecFields spec={r} onChange={(p) => save({ ...r, ...p })} />
            <PickField
              label={t("length")}
              value={String(r.lengthM)}
              onChange={(v) => {
                const lengthM = Number(v)
                save({ ...r, lengthM, leftM: Math.min(r.leftM, lengthM) })
              }}
              options={[...new Set<number>([...LENGTHS, r.lengthM])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n.toLocaleString("es-MX")} m` }))}
            />
          </div>
          <AreaField label={t("notes")} value={r.notes} onChange={(notes) => save({ ...r, notes })} rows={2} />
          {r.by && <p className="text-xs text-zinc-400">{t("addedBy", { name: r.by })}</p>}
          <div className="flex flex-wrap gap-2">
            {s !== "vacia" && (
              <button type="button" onClick={() => save({ ...r, leftM: 0 })} className={SMALL}>
                {t("markEmpty")}
              </button>
            )}
            <button type="button" onClick={() => window.confirm(t("confirmDelete")) && rollsStore.remove(r.id)} className={DANGER}>
              {t("delete")}
            </button>
          </div>
          <RecordHistory kind="rolls" id={r.id} />
        </div>
      )}
    </li>
  )
}

/**
 * The menus that say what cable a roll is. Picking a cable fills in its usual mode, standard and indoor/outdoor (a
 * drop: single mode G.657A2, outdoor); picking a mode keeps the standard only if it belongs to it.
 */
function SpecFields({ spec, onChange }: { spec: Spec; onChange: (p: Partial<Spec>) => void }) {
  const t = useTranslations("materiales.rolls")
  return (
    <>
      <PickField label={t("cable")} value={spec.cable} onChange={(cable) => onChange({ cable, ...cableDefaults(cable) })} options={CABLES.map((c) => ({ value: c, label: t(`cables.${c}`) }))} />
      <PickField label={t("strands")} value={String(spec.strands)} onChange={(v) => onChange({ strands: Number(v) })} options={STRANDS.map((n) => ({ value: String(n), label: t("strandsN", { n }) }))} />
      <PickField
        label={t("mode")}
        value={spec.mode}
        onChange={(mode) => onChange({ mode, fiber: fibersFor(mode).includes(spec.fiber) ? spec.fiber : fibersFor(mode)[0] })}
        options={MODES.map((m) => ({ value: m, label: t(`modes.${m}`) }))}
      />
      <PickField label={t("fiber")} value={spec.fiber} onChange={(fiber) => onChange({ fiber })} options={fibersFor(spec.mode).map((f) => ({ value: f, label: t(`fibers.${f}`) }))} />
      <PickField label={t("env")} value={spec.env} onChange={(env) => onChange({ env })} options={ENVS.map((e) => ({ value: e, label: t(`envs.${e}`) }))} />
      <PickField label={t("jacket")} value={spec.jacket} onChange={(jacket) => onChange({ jacket })} options={JACKETS.map((j) => ({ value: j, label: t(`jackets.${j || "none"}`) }))} />
      <PickField label={t("buffer")} value={spec.buffer} onChange={(buffer) => onChange({ buffer })} options={BUFFERS.map((b) => ({ value: b, label: t(`buffers.${b || "none"}`) }))} />
      <PickField label={t("endsLabel")} value={spec.ends} onChange={(ends) => onChange({ ends })} options={ENDS.map((e) => ({ value: e, label: t(`ends.${e}`) }))} />
      <TextField label={t("brand")} value={spec.brand} onChange={(brand) => onChange({ brand: brand.slice(0, 80) })} />
    </>
  )
}
