"use client"

import { useSyncExternalStore } from "react"
import { InlineField } from "@/components/interno/InlineField"
import type { Client } from "@/lib/clients/model"
import { mxn } from "@/lib/materials/catalog"
import { isKind, providerName } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { EQUIPMENT_KINDS, newEquipment, newPort, newRoom, newRoomCarrier, removeRoom, roomCapacity, roomLabel, towerLabel, type EquipmentKind, type Room, type Site } from "@/lib/sites/model"
import { portClients } from "@/lib/sites/stats"
import { ConfirmRemove } from "./ConfirmRemove"
import { SheetBlock } from "./SheetBlock"
import { ADD, FIELDS, FIELDS_WIDE, ITEM, NOTE, type T, type Up } from "./sheet-ui"

const SUB = "grid gap-2"
const SUBTITLE = "flex flex-wrap items-baseline justify-between gap-2 px-2 text-sm font-medium text-zinc-100"

/** The telecom rooms, each with its place and power, its equipment, the carriers that arrive there and its PON ports. */
export function RoomsBlock({ t, s, up, clients }: { t: T; s: Site; up: Up; clients: Client[] }) {
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list
  const carriers = providers.filter((p) => isKind(p, "carrier"))
  const setRoom = (r: Room) => up({ rooms: s.rooms.map((x) => (x.id === r.id ? r : x)) })
  return (
    <SheetBlock id="cuartos" title={t("nav.cuartos")} aside={t("sheet.roomsAside", { n: s.rooms.length })}>
      {s.rooms.map((r, i) => {
        const ru = (p: Partial<Room>) => setRoom({ ...r, ...p })
        const served = s.towers.map((x, k) => ({ x, k })).filter(({ x }) => x.roomId === r.id)
        const olts = r.equipment.filter((e) => e.kind === "olt")
        const counts = portClients(s, r, clients)
        const capacity = roomCapacity(r)
        const setEq = (id: string, p: Partial<Room["equipment"][number]>) => ru({ equipment: r.equipment.map((x) => (x.id === id ? { ...x, ...p } : x)) })
        const setCa = (id: string, p: Partial<Room["carriers"][number]>) => ru({ carriers: r.carriers.map((x) => (x.id === id ? { ...x, ...p } : x)) })
        const setPo = (id: string, p: Partial<Room["ports"][number]>) => ru({ ports: r.ports.map((x) => (x.id === id ? { ...x, ...p } : x)) })
        return (
          <div key={r.id} role="group" aria-labelledby={`room-${r.id}`} className="grid gap-3 rounded-lg border border-white/15 p-2 sm:p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
              <h3 id={`room-${r.id}`} className="text-sm font-medium text-foreground">
                {roomLabel(r, i)}
              </h3>
              <p className="text-xs text-zinc-400">{served.length ? t("rooms.serves", { towers: served.map(({ x, k }) => towerLabel(x, k)).join(", ") }) : t("rooms.servesNone")}</p>
            </div>
            <div className={FIELDS}>
              <InlineField kind="text" label={t("rooms.name")} value={r.name} onSave={(name) => ru({ name })} hint={t("rooms.nameHint")} max={80} />
              <InlineField kind="text" anchor={`room.${r.id}.location`} label={t("rooms.location")} value={r.location} onSave={(location) => ru({ location })} hint={t("rooms.locationHint")} max={200} />
              <InlineField kind="text" anchor={`room.${r.id}.breaker`} label={t("rooms.breaker")} value={r.breaker} onSave={(breaker) => ru({ breaker })} hint={t("rooms.breakerHint")} max={120} />
              <InlineField kind="number" label={t("rooms.upsHours")} unit="h" max={1000} value={r.upsHours} onSave={(upsHours) => ru({ upsHours })} />
              <InlineField kind="area" label={t("rooms.access")} value={r.access} onSave={(access) => ru({ access })} hint={t("rooms.accessHint")} max={2000} className="col-span-full sm:col-span-1" />
              <InlineField kind="area" label={t("rooms.powerNotes")} value={r.powerNotes} onSave={(powerNotes) => ru({ powerNotes })} max={2000} className="col-span-full sm:col-span-1" />
            </div>

            <div className={SUB}>
              <p className={SUBTITLE}>{t("rooms.equipment.title")}</p>
              {!r.equipment.length && <p className={NOTE}>{t("rooms.equipment.none")}</p>}
              {r.equipment.map((e, k) => (
                <div key={e.id} role="group" aria-label={`${t(`rooms.equipment.kinds.${e.kind}`)} ${k + 1}`} className={ITEM}>
                  <div className={FIELDS_WIDE}>
                    <InlineField
                      kind="pick"
                      label={t("sheet.kind")}
                      value={e.kind}
                      options={EQUIPMENT_KINDS.map((x) => ({ value: x, label: t(`rooms.equipment.kinds.${x}`) }))}
                      // An OLT that stops being one leaves its ports without OLT.
                      onSave={(v) => ru({ equipment: r.equipment.map((x) => (x.id === e.id ? { ...x, kind: v as EquipmentKind } : x)), ports: v === "olt" ? r.ports : r.ports.map((p) => (p.oltId === e.id ? { ...p, oltId: "" } : p)) })}
                    />
                    <InlineField kind="text" label={t("rooms.equipment.model")} value={e.model} onSave={(model) => setEq(e.id, { model })} max={80} />
                    <InlineField kind="text" label={t("rooms.equipment.serial")} value={e.serial} onSave={(v) => setEq(e.id, { serial: v.toUpperCase() })} max={60} />
                    <InlineField kind="text" label={t("rooms.equipment.ip")} value={e.ip} onSave={(ip) => setEq(e.id, { ip })} max={60} />
                    <InlineField kind="text" label={t("rooms.equipment.firmware")} value={e.firmware} onSave={(firmware) => setEq(e.id, { firmware })} max={60} />
                    <InlineField kind="area" label={t("rooms.equipment.notes")} value={e.notes} onSave={(notes) => setEq(e.id, { notes })} max={2000} className="col-span-full" />
                  </div>
                  <div className="px-2 pb-1">
                    <ConfirmRemove
                      label={t("rooms.equipment.remove")}
                      question={t("sheet.confirm", { name: [t(`rooms.equipment.kinds.${e.kind}`), e.model].filter(Boolean).join(" ") })}
                      onRemove={() => ru({ equipment: r.equipment.filter((x) => x.id !== e.id), ports: r.ports.map((p) => (p.oltId === e.id ? { ...p, oltId: "" } : p)) })}
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 px-2">
                {EQUIPMENT_KINDS.map((kind) => (
                  <button key={kind} type="button" onClick={() => ru({ equipment: [...r.equipment, newEquipment(kind)] })} className={ADD}>
                    {t(`rooms.equipment.add.${kind}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className={SUB}>
              <p className={SUBTITLE}>
                <span>{t("rooms.carriers.title")}</span>
                {capacity !== null && <span className="font-mono text-xs font-normal text-zinc-400">{t("rooms.carriers.capacity", { mbps: capacity })}</span>}
              </p>
              {!r.carriers.length && <p className={NOTE}>{t("rooms.carriers.none")}</p>}
              {r.carriers.map((c, k) => {
                const known = carriers.find((p) => p.id === c.providerId)
                return (
                  <div key={c.id} role="group" aria-label={`${t("rooms.carriers.provider")} ${c.name || k + 1}`} className={ITEM}>
                    <div className={FIELDS_WIDE}>
                      <InlineField
                        kind="pick"
                        label={t("rooms.carriers.provider")}
                        value={c.providerId}
                        hint={t("rooms.carriers.providerHint")}
                        options={[
                          { value: "", label: t("rooms.carriers.other") },
                          ...(c.providerId && !known ? [{ value: c.providerId, label: c.name || c.providerId.slice(0, 8) }] : []),
                          ...carriers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 8) })),
                        ]}
                        display={known ? providerName(known) : c.providerId ? c.name || undefined : t("rooms.carriers.other")}
                        onSave={(providerId) => {
                          const p = carriers.find((x) => x.id === providerId)
                          setCa(c.id, { providerId, name: p ? providerName(p) : c.name })
                        }}
                      />
                      {!c.providerId && <InlineField kind="text" label={t("rooms.carriers.name")} value={c.name} onSave={(name) => setCa(c.id, { name })} max={120} />}
                      <InlineField kind="number" anchor={`carrier.${c.id}.down`} label={t("rooms.carriers.down")} unit="Mbps" max={1e6} value={c.downMbps} onSave={(downMbps) => setCa(c.id, { downMbps })} />
                      <InlineField kind="number" label={t("rooms.carriers.up")} unit="Mbps" max={1e6} value={c.upMbps} onSave={(upMbps) => setCa(c.id, { upMbps })} />
                      <InlineField kind="number" anchor={`carrier.${c.id}.monthly`} label={t("rooms.carriers.monthly")} unit="MXN" max={1e7} value={c.monthly} display={c.monthly !== null ? mxn(c.monthly) : undefined} onSave={(monthly) => setCa(c.id, { monthly })} hint={t("rooms.carriers.monthlyHint")} />
                      <InlineField kind="text" label={t("rooms.carriers.ip")} value={c.ip} onSave={(ip) => setCa(c.id, { ip })} hint={t("rooms.carriers.ipHint")} max={60} />
                      <InlineField kind="text" label={t("rooms.carriers.account")} value={c.account} onSave={(account) => setCa(c.id, { account })} max={80} />
                      <InlineField kind="area" label={t("rooms.carriers.notes")} value={c.notes} onSave={(notes) => setCa(c.id, { notes })} max={2000} className="col-span-full" />
                    </div>
                    <div className="px-2 pb-1">
                      <ConfirmRemove label={t("rooms.carriers.remove")} question={t("sheet.confirm", { name: c.name || t("rooms.carriers.provider") })} onRemove={() => ru({ carriers: r.carriers.filter((x) => x.id !== c.id) })} />
                    </div>
                  </div>
                )
              })}
              <div className="px-2">
                <button type="button" onClick={() => ru({ carriers: [...r.carriers, newRoomCarrier()] })} className={ADD}>
                  + {t("rooms.carriers.add")}
                </button>
              </div>
            </div>

            <div className={SUB}>
              <p className={SUBTITLE}>{t("rooms.ports.title")}</p>
              {!r.ports.length && <p className={NOTE}>{t("rooms.ports.none")}</p>}
              {r.ports.map((p, k) => (
                <div key={p.id} role="group" aria-label={`${t("rooms.ports.port")} ${p.port || k + 1}`} className={ITEM}>
                  <div className={FIELDS_WIDE}>
                    <InlineField kind="text" label={t("rooms.ports.port")} value={p.port} onSave={(port) => setPo(p.id, { port })} hint={t("rooms.ports.portHint")} max={20} />
                    {olts.length > 1 && <InlineField kind="pick" label={t("rooms.ports.olt")} value={p.oltId} options={[{ value: "", label: "—" }, ...olts.map((o, j) => ({ value: o.id, label: o.model || `OLT ${j + 1}` }))]} onSave={(oltId) => setPo(p.id, { oltId })} />}
                    <InlineField kind="pick" label={t("rooms.ports.tower")} value={p.towerId} options={[{ value: "", label: t("rooms.ports.noTower") }, ...s.towers.map((x, j) => ({ value: x.id, label: towerLabel(x, j) }))]} onSave={(towerId) => setPo(p.id, { towerId })} />
                    <InlineField kind="text" label={t("rooms.ports.splitters")} value={p.splitters} onSave={(splitters) => setPo(p.id, { splitters })} hint={t("rooms.ports.splittersHint")} max={200} />
                    <InlineField kind="area" label={t("rooms.ports.notes")} value={p.notes} onSave={(notes) => setPo(p.id, { notes })} max={2000} className="col-span-full" />
                  </div>
                  <p className={NOTE} title={t("rooms.ports.clientsHint")}>
                    {t("rooms.ports.clients", { n: counts[p.id] ?? 0 })}
                  </p>
                  <div className="px-2 pb-1">
                    <ConfirmRemove label={t("rooms.ports.remove")} question={t("sheet.confirm", { name: `${t("rooms.ports.port")} ${p.port || k + 1}` })} onRemove={() => ru({ ports: r.ports.filter((x) => x.id !== p.id) })} />
                  </div>
                </div>
              ))}
              <div className="px-2">
                <button type="button" onClick={() => ru({ ports: [...r.ports, newPort()] })} className={ADD}>
                  + {t("rooms.ports.add")}
                </button>
              </div>
            </div>

            <div className="px-2 pb-1">
              <ConfirmRemove label={t("rooms.remove")} question={t("rooms.confirmRemove", { name: roomLabel(r, i) })} onRemove={() => up(removeRoom(s, r.id))} />
            </div>
          </div>
        )
      })}
      <div>
        <button type="button" onClick={() => up({ rooms: [...s.rooms, newRoom()] })} className={ADD}>
          + {t("rooms.add")}
        </button>
      </div>
    </SheetBlock>
  )
}
