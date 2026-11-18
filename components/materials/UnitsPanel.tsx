"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, PickField } from "@/components/surveys/SurveyFields"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import type { Item } from "@/lib/materials/catalog"
import { BODEGA, UNIT_STATES, normSerial, repeatedSerials, toRecover, type Unit, type UnitState } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { MoveForm } from "./MoveForm"
import { clientLine, usePlaceLabel, usePlaceOptions } from "./places"

const SMALL = "inline-flex min-h-10 w-fit items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** ONTs and other equipment by serial number: where each one is, the ones to recover from cancelled clients. */
export function UnitsPanel({ items }: { items: Item[] }) {
  const t = useTranslations("materiales")
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const placeLabel = usePlaceLabel()
  const placeOptions = usePlaceOptions()
  const [q, setQ] = useState("")
  const [state, setState] = useState<UnitState | "">("")
  const [open, setOpen] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [msg, setMsg] = useState("")
  const recover = toRecover(units, clients)
  const repeated = repeatedSerials(units)
  const needle = normSerial(q)
  const clientOf = (u: Unit) => clients.find((c) => c.id === u.clientId)
  const where = (u: Unit) => (u.state === "cliente" ? (clientOf(u) ? clientLine(clientOf(u)!) : t("stock.unknownClient")) : u.place ? placeLabel(u.place) : "")
  const shown = units
    .filter((u) => (!state || u.state === state) && (!needle || normSerial(u.serial).includes(needle) || normSerial(where(u)).includes(needle)))
    .sort((a, b) => a.serial.localeCompare(b.serial))
  const ont = items.find((x) => x.role === "ont" && x.serialized) ?? items.find((x) => x.serialized)
  const save = (u: Unit) => unitsStore.save(u)
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("units.intro")}</p>
      {msg && (
        <p role="status" className="text-sm text-emerald-300">
          {msg}
        </p>
      )}
      {receiving ? (
        <MoveForm
          items={items}
          kind="compra"
          itemId={ont?.id}
          onDone={(m) => {
            setReceiving(false)
            setMsg(m)
          }}
        />
      ) : (
        <button type="button" onClick={() => (setMsg(""), setReceiving(true))} className={SMALL}>
          {t("units.receive")}
        </button>
      )}

      {recover.length > 0 && (
        <section aria-labelledby="units-recover" className="grid gap-2 rounded-xl border border-amber-400/30 p-3">
          <h3 id="units-recover" className="text-sm font-medium text-amber-200">
            {t("units.recoverTitle", { n: recover.length })}
          </h3>
          <p className="text-xs text-zinc-300">{t("units.recoverHint")}</p>
          <ul className="grid gap-1">
            {recover.map((u) => {
              const c = clientOf(u)
              return (
                <li key={u.id} className="text-sm text-zinc-100">
                  <span className="font-mono">{u.serial}</span> · {c ? clientLine(c) : t("stock.unknownClient")}
                  {c?.phone ? (
                    <>
                      {" · "}
                      <a href={`tel:${c.phone}`} className="underline underline-offset-4">
                        {c.phone}
                      </a>
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {repeated.size > 0 && (
        <p role="note" className="rounded-xl border border-red-400/30 p-3 text-sm text-red-200">
          {t("units.repeated", { serials: [...repeated].join(", ") })}
        </p>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("units.search")} value={q} onChange={setQ} hint={t("units.searchHint")} />
        <PickField label={t("units.state")} value={state} onChange={setState} options={[{ value: "" as const, label: t("units.allStates") }, ...UNIT_STATES.map((s) => ({ value: s, label: t(`units.states.${s}`) }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("units.count", { n: shown.length, stock: units.filter((u) => u.state === "almacen").length, clients: units.filter((u) => u.state === "cliente").length })}</p>
      {!units.length && <p className="text-sm text-zinc-400">{t("units.empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((u) => {
          const isOpen = open === u.id
          const hist = moves.filter((m) => m.serials.includes(normSerial(u.serial))).sort((a, b) => b.date.localeCompare(a.date))
          return (
            <li key={u.id} className="rounded-xl border border-white/10">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : u.id)} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="grid gap-0.5">
                  <span className="font-mono text-sm text-zinc-100">{u.serial}</span>
                  <span className="text-xs text-zinc-400">
                    {items.find((x) => x.id === u.itemId)?.name ?? t("stock.unknownItem")} · {where(u)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-300">{t(`units.states.${u.state}`)}</span>
              </button>
              {isOpen && (
                <div className="grid gap-4 border-t border-white/10 p-3">
                  <p className="text-xs text-zinc-400">{t("units.editHint")}</p>
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <PickField
                      label={t("units.state")}
                      value={u.state}
                      onChange={(s) => save({ ...u, state: s, place: s === "almacen" || s === "danado" ? u.place || BODEGA : "", clientId: s === "cliente" ? u.clientId : "" })}
                      options={UNIT_STATES.map((s) => ({ value: s, label: t(`units.states.${s}`) }))}
                    />
                    {(u.state === "almacen" || u.state === "danado") && <PickField label={t("move.place")} value={u.place} onChange={(place) => save({ ...u, place })} options={placeOptions} />}
                  </div>
                  <AreaField label={t("move.notes")} value={u.notes} onChange={(notes) => save({ ...u, notes })} rows={2} />
                  {u.state === "cliente" && clientOf(u) && (
                    <a href={`/interno/admin/clientes?c=${u.clientId}`} className="w-fit text-sm text-zinc-300 underline underline-offset-4 hover:text-foreground">
                      {t("units.openClient")}
                    </a>
                  )}
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-foreground">{t("units.history")}</p>
                    {!hist.length && <p className="text-xs text-zinc-400">{t("stock.noHistory")}</p>}
                    {hist.map((m) => (
                      <p key={m.id} className="text-xs text-zinc-300">
                        {m.date} · {t(`move.kinds.${m.kind}`)}
                        {m.by ? ` · ${m.by}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
