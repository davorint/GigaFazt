"use client"

import { InlineField } from "@/components/interno/InlineField"
import { newTower, removeTower, roomLabel, setFloorUnits, syncPerFloor, towerApartments, towerLabel, type Site, type Tower } from "@/lib/sites/model"
import type { SiteStats } from "@/lib/sites/stats"
import { ConfirmRemove } from "./ConfirmRemove"
import { SheetBlock } from "./SheetBlock"
import { ADD, FIELDS_WIDE, ITEM, NOTE, type T, type Up } from "./sheet-ui"

/** The towers: each one's fields in place, its clients, and its apartments floor by floor (planta baja = piso 1). */
export function TowersBlock({ t, s, up, stats }: { t: T; s: Site; up: Up; stats: SiteStats }) {
  const set = (x: Tower) => up({ towers: s.towers.map((y) => (y.id === x.id ? x : y)) })
  const rooms = [{ value: "", label: t("towers.noRoom") }, ...s.rooms.map((r, k) => ({ value: r.id, label: roomLabel(r, k) }))]
  const total = s.towers.reduce((a, x) => a + (towerApartments(x) ?? 0), 0)
  return (
    <SheetBlock id="torres" title={t("nav.torres")} aside={t("sheet.towersAside", { n: s.towers.length, apartments: total })}>
      {s.towers.map((x, i) => {
        const b = stats.byTower[x.id] ?? { clients: 0, active: 0 }
        const apartments = towerApartments(x)
        const counted = x.perFloor.some((v) => v !== null)
        return (
          <div key={x.id} role="group" aria-label={towerLabel(x, i)} className={ITEM}>
            <div className={FIELDS_WIDE}>
              <InlineField kind="text" label={t("towers.name")} value={x.name} display={x.name || towerLabel(x, i)} onSave={(name) => set({ ...x, name })} hint={t("towers.nameHint")} max={80} />
              <InlineField kind="pick" anchor={`tower.${x.id}.room`} label={t("towers.room")} value={x.roomId} options={rooms} onSave={(roomId) => set({ ...x, roomId })} />
              <InlineField kind="number" anchor={`tower.${x.id}.floors`} label={t("towers.floors")} integer max={200} value={x.floors} onSave={(floors) => set(syncPerFloor({ ...x, floors }))} hint={t("towers.floorsHint")} />
              <InlineField kind="number" label={t("towers.basements")} integer max={20} value={x.basements} onSave={(basements) => set({ ...x, basements })} />
              {counted ? (
                <div id={`f-tower.${x.id}.apartments`} className="grid gap-0.5 px-2 py-1.5">
                  <span className="font-mono text-[0.7rem] text-zinc-400">{t("towers.apartments")}</span>
                  <span className="text-sm text-zinc-100">{t("sheet.apartmentsSum", { n: apartments ?? 0 })}</span>
                </div>
              ) : (
                <InlineField kind="number" anchor={`tower.${x.id}.apartments`} label={t("towers.apartments")} integer max={5000} value={x.apartments} onSave={(v) => set({ ...x, apartments: v })} />
              )}
              <InlineField kind="area" label={t("towers.notes")} value={x.notes} onSave={(notes) => set({ ...x, notes })} className="col-span-full" />
            </div>
            <p className={NOTE}>{t("towers.clients", { clients: b.clients, active: b.active, apartments: apartments ? "some" : "none", pct: apartments ? Math.round((b.clients / apartments) * 100) : 0 })}</p>
            <details className="group px-2">
              <summary className="cursor-pointer py-1 text-xs text-zinc-300 hover:text-foreground">{t("sheet.floorsTitle", { n: x.perFloor.filter((v) => v !== null).length, of: x.perFloor.length })}</summary>
              {!x.floors ? (
                <p className="py-1 text-xs text-zinc-400">{t("sheet.floorsNone")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-2 py-1 sm:grid-cols-4 lg:grid-cols-6">
                  {x.perFloor.map((v, f) => (
                    <InlineField key={f} kind="number" label={t("sheet.floor", { n: f + 1 })} integer max={500} value={v} onSave={(units) => set(setFloorUnits(x, f, units))} />
                  ))}
                </div>
              )}
            </details>
            <div className="px-2 pb-1">
              <ConfirmRemove label={t("towers.remove")} question={t("towers.confirmRemove", { name: towerLabel(x, i) })} onRemove={() => up(removeTower(s, x.id))} />
            </div>
          </div>
        )
      })}
      <div id="f-towers">
        <button type="button" onClick={() => up({ towers: [...s.towers, newTower({ roomId: s.rooms.length === 1 ? s.rooms[0].id : "" })] })} className={ADD}>
          + {t("towers.add")}
        </button>
      </div>
    </SheetBlock>
  )
}
