"use client"

import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { MAX_FLOORS_ABOVE, MAX_FLOORS_BELOW, MAX_ITEMS, emptyTower, fillFloors, syncFloors, towerUnits, type Floor, type Tower } from "@/lib/survey/model"
import { AddButton, AreaField, GRID, ItemCard, PickField, TriField } from "./SurveyFields"
import type { SectionProps } from "./SurveySections"

const TOWER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** Each tower: its counts, its service duct, and one compact card per floor (top floor first, as you walk down). */
export function TowersSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const upT = (id: string, next: Tower) => set({ ...s, towers: s.towers.map((x) => (x.id === id ? next : x)) })
  return (
    <div className="grid gap-4">
      {s.towers.map((tw) => (
        <TowerCard key={tw.id} tower={tw} canRemove={s.towers.length > 1} onChange={(n) => upT(tw.id, n)} onRemove={() => set({ ...s, towers: s.towers.filter((x) => x.id !== tw.id) })} />
      ))}
      <AddButton disabled={s.towers.length >= MAX_ITEMS} onClick={() => set({ ...s, towers: [...s.towers, emptyTower(t("towers.defaultName", { l: TOWER_LETTERS[s.towers.length] ?? String(s.towers.length + 1) }))] })}>
        {t("towers.add")}
      </AddButton>
    </div>
  )
}

function TowerCard({ tower: tw, onChange, onRemove, canRemove }: { tower: Tower; onChange: (t: Tower) => void; onRemove: () => void; canRemove: boolean }) {
  const t = useTranslations("levantamientos")
  const up = (p: Partial<Tower>) => onChange(syncFloors({ ...tw, ...p }))
  const upF = (level: number, p: Partial<Floor>) => onChange({ ...tw, floors: tw.floors.map((f) => (f.level === level ? { ...f, ...p } : f)) })
  const spaces = ["", "amplio", "justo", "lleno"] as const
  const conduits = ["", "si", "algunos", "no", "obstruido"] as const
  const floorName = (level: number) => (level === 0 ? t("towers.ground") : level < 0 ? t("towers.basement", { n: -level }) : t("towers.floor", { n: level }))
  const body = (
    <>
      <div className={GRID}>
        <TextField label={t("towers.name")} value={tw.name} onChange={(v) => onChange({ ...tw, name: v })} />
        <NumberField label={t("towers.floorsAbove")} unit={t("unit.levels")} integer optional max={MAX_FLOORS_ABOVE} value={tw.floorsAbove} onChange={(v) => up({ floorsAbove: v })} hint={t("towers.floorsAboveHint")} />
        <NumberField label={t("towers.floorsBelow")} unit={t("unit.levels")} integer optional max={MAX_FLOORS_BELOW} value={tw.floorsBelow} onChange={(v) => up({ floorsBelow: v })} />
        <NumberField label={t("towers.floorHeight")} unit="m" optional max={20} value={tw.floorHeightM} onChange={(v) => onChange({ ...tw, floorHeightM: v })} />
      </div>
      <div className="grid gap-4 rounded-xl border border-white/10 p-4">
        <p className="text-sm font-medium text-foreground">{t("towers.ductTitle")}</p>
        <TextField label={t("towers.ductType")} hint={t("towers.ductTypeHint")} value={tw.ductType} onChange={(v) => onChange({ ...tw, ductType: v })} />
        <div className={GRID}>
          <PickField label={t("towers.ductSpace")} value={tw.ductSpace} onChange={(v) => onChange({ ...tw, ductSpace: v })} options={spaces.map((x) => ({ value: x, label: t(`towers.spaces.${x || "none"}`) }))} />
          <TriField label={t("towers.firestop")} value={tw.firestop} onChange={(v) => onChange({ ...tw, firestop: v })} />
        </div>
        <AreaField label={t("towers.ductOthers")} value={tw.ductOthers} onChange={(v) => onChange({ ...tw, ductOthers: v })} rows={2} />
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{t("towers.floorsTitle")}</p>
          {tw.floors.length > 0 && <p className="font-mono text-xs text-zinc-400">{t("towers.unitsTotal", { units: towerUnits(tw), floors: tw.floors.length })}</p>}
        </div>
        {!tw.floors.length && <p className="text-sm text-zinc-400">{t("towers.floorsEmpty")}</p>}
        {[...tw.floors].reverse().map((f) => (
          <details key={f.level} className="group rounded-xl border border-white/10">
            <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3 text-sm text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span>{floorName(f.level)}</span>
              <span className="font-mono text-xs text-zinc-400">
                {f.units ?? "–"} · {f.farthestM ?? "–"} m{f.conduit ? ` · ${t(`towers.conduits.${f.conduit}`)}` : ""}
              </span>
            </summary>
            <div className="grid gap-4 px-3 pb-4">
              <div className={GRID}>
                <NumberField label={t("towers.units")} unit={t("unit.units")} integer optional max={200} value={f.units} onChange={(v) => upF(f.level, { units: v })} />
                <NumberField label={t("towers.farthest")} unit="m" optional max={1000} value={f.farthestM} onChange={(v) => upF(f.level, { farthestM: v })} />
                <PickField label={t("towers.conduit")} value={f.conduit} onChange={(v) => upF(f.level, { conduit: v })} options={conduits.map((x) => ({ value: x, label: t(`towers.conduits.${x || "none"}`) }))} />
                <TextField label={t("towers.boxSpot")} value={f.boxSpot} onChange={(v) => upF(f.level, { boxSpot: v })} />
              </div>
              <AreaField label={t("towers.floorNotes")} value={f.notes} onChange={(v) => upF(f.level, { notes: v })} rows={2} />
              <div className="grid gap-1">
                <button
                  type="button"
                  onClick={() => onChange(fillFloors(tw, f))}
                  className="h-10 rounded-xl border border-white/15 text-sm text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-fit sm:px-4"
                >
                  {t("towers.copy")}
                </button>
                <p className="text-xs text-zinc-400">{t("towers.copyHint")}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
      <AreaField label={t("towers.notes")} value={tw.notes} onChange={(v) => onChange({ ...tw, notes: v })} />
    </>
  )
  return canRemove ? (
    <ItemCard title={tw.name || t("towers.name")} removeLabel={t("towers.remove")} onRemove={onRemove}>
      {body}
    </ItemCard>
  ) : (
    <div className="grid gap-4 rounded-xl border border-white/10 p-4">{body}</div>
  )
}
