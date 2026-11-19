"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { CLIENT_ROLES, type Item } from "@/lib/materials/catalog"
import { BODEGA, countAt, placesUsed, stockValue, type Move, type MoveKind, type Unit } from "@/lib/stock/model"
import { mxn } from "@/lib/materials/catalog"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { MoveForm } from "./MoveForm"
import { ExportButton } from "@/components/interno/ExportButton"
import { toCsv } from "@/lib/csv"
import { clientLine, usePlaceLabel, usePlaceOptions } from "./places"

const SMALL = "inline-flex min-h-10 w-fit items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const ACTIONS: MoveKind[] = ["compra", "instalacion", "reemplazo", "traspaso", "devolucion", "baja", "ajuste"]

/** What each place has, low-stock warnings, recording movements and their history. */
export function StockPanel({ items }: { items: Item[] }) {
  const t = useTranslations("materiales")
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const placeLabel = usePlaceLabel()
  const placeOptions = usePlaceOptions()
  const [form, setForm] = useState<MoveKind | null>(null)
  const [msg, setMsg] = useState("")
  const [place, setPlace] = useState("")
  const [all, setAll] = useState(false)
  const [itemFilter, setItemFilter] = useState("")
  const places = place ? [place] : placesUsed(moves, units)
  // Materials shown: the ones with stock somewhere, a minimum set, tracked by serial, or used in every installation.
  const relevant = items.filter((x) => all || x.serialized || x.minStock !== null || (x.role && CLIENT_ROLES.includes(x.role)) || places.some((p) => countAt(x, moves, units, p) !== 0))
  const low = items.filter((x) => x.minStock !== null && countAt(x, moves, units, BODEGA) < x.minStock)
  const history = [...moves]
    .filter((m) => (!itemFilter || m.itemId === itemFilter) && (!place || m.from === place || m.to === place))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60)
  const itemName = (id: string) => items.find((x) => x.id === id)?.name ?? t("stock.unknownItem")
  const ends = (m: (typeof moves)[number]) => {
    const client = clients.find((c) => c.id === m.clientId)
    const who = m.clientId ? (client ? clientLine(client) : t("stock.unknownClient")) : ""
    if (m.kind === "compra" || m.kind === "ajuste") return `→ ${placeLabel(m.to)}`
    if (m.kind === "traspaso") return `${placeLabel(m.from)} → ${placeLabel(m.to)}`
    if (m.kind === "devolucion") return `${who} → ${placeLabel(m.to)}`
    if (m.kind === "baja") return `${placeLabel(m.from)} →`
    return `${placeLabel(m.from)} → ${who}`
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("stock.intro")}</p>
      {msg && (
        <p role="status" className="text-sm text-emerald-300">
          {msg}
        </p>
      )}
      {form ? (
        <MoveForm
          key={form}
          items={items}
          kind={form}
          onDone={(m) => {
            setForm(null)
            setMsg(m)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((k) => (
            <button key={k} type="button" onClick={() => (setMsg(""), setForm(k))} className={SMALL}>
              {t(`move.kinds.${k}`)}
            </button>
          ))}
        </div>
      )}

      {low.length > 0 && (
        <div role="note" className="grid gap-1 rounded-xl border border-amber-400/30 p-3">
          <p className="text-sm font-medium text-amber-200">{t("stock.lowTitle")}</p>
          {low.map((x) => (
            <p key={x.id} className="text-sm text-amber-100">
              {t("stock.low", { name: x.name, n: countAt(x, moves, units, BODEGA), min: x.minStock ?? 0, unit: x.unit })}
            </p>
          ))}
        </div>
      )}

      <StockValue t={t} places={places} items={items} moves={moves} units={units} label={placeLabel} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <PickField label={t("stock.place")} value={place} onChange={setPlace} options={[{ value: "", label: t("stock.allPlaces") }, ...placeOptions]} />
        <label className="flex min-h-10 items-center gap-2 self-end text-sm text-zinc-200">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-5 accent-white" />
          {t("stock.showAll")}
        </label>
      </div>
      <ul className="grid gap-2">
        {relevant.map((x) => {
          const counts = places.map((p) => ({ p, n: countAt(x, moves, units, p) })).filter((r) => place || r.n !== 0)
          const isLow = x.minStock !== null && countAt(x, moves, units, BODEGA) < x.minStock
          return (
            <li key={x.id} className={`grid gap-1 rounded-xl border p-3 ${isLow ? "border-amber-400/40" : "border-white/10"}`}>
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm text-zinc-100">{x.name}</span>
                {x.serialized && <span className="shrink-0 text-xs text-zinc-400">{t("move.bySerial")}</span>}
              </span>
              <span className="font-mono text-sm text-zinc-200">{counts.length ? counts.map((r) => `${placeLabel(r.p)}: ${r.n} ${x.unit}`).join(" · ") : t("stock.none")}</span>
              {counts.some((r) => r.n < 0) && <span className="text-xs text-amber-200">{t("stock.negative")}</span>}
            </li>
          )
        })}
      </ul>

      <section aria-labelledby="stock-history" className="grid gap-3">
        <h3 id="stock-history" className="text-lg font-medium text-foreground">
          {t("stock.history")}
        </h3>
        <ExportButton
          label={t("stock.exportCsv")}
          name="movimientos"
          disabled={!moves.length}
          build={() => {
            const itemName = (id: string) => items.find((x) => x.id === id)?.name ?? t("stock.unknownItem")
            const clientName = (id: string) => {
              const c = clients.find((x) => x.id === id)
              return c ? clientLine(c) : id ? t("stock.unknownClient") : ""
            }
            return toCsv(
              [t("move.date"), t("move.kind"), t("move.item"), t("move.qty"), t("move.from"), t("move.to"), t("move.client"), t("move.serials"), t("stock.csvBy"), t("move.notes")],
              [...moves]
                .sort((x, y) => y.date.localeCompare(x.date))
                .map((m) => [m.date, t(`move.kinds.${m.kind}`), itemName(m.itemId), m.qty, m.from ? placeLabel(m.from) : "", m.to ? placeLabel(m.to) : "", clientName(m.clientId), m.serials.join(" "), m.by, m.notes])
            )
          }}
        />
        <PickField label={t("stock.itemFilter")} value={itemFilter} onChange={setItemFilter} options={[{ value: "", label: t("stock.allItems") }, ...[...items].sort((a, b) => a.name.localeCompare(b.name, "es")).map((x) => ({ value: x.id, label: x.name }))]} />
        {!history.length && <p className="text-sm text-zinc-400">{t("stock.noHistory")}</p>}
        <ul className="grid gap-2">
          {history.map((m) => (
            <li key={m.id} className="grid gap-1 rounded-lg border border-white/10 p-3 text-sm">
              <span className="flex flex-wrap justify-between gap-2">
                <span className="text-zinc-100">
                  {t(`move.kinds.${m.kind}`)} · {itemName(m.itemId)}
                </span>
                <span className="font-mono text-xs text-zinc-400">{m.date}</span>
              </span>
              <span className="text-xs text-zinc-300">
                {m.serials.length ? m.serials.join(", ") : `${m.qty} ${items.find((x) => x.id === m.itemId)?.unit ?? ""}`} {ends(m)}
                {m.by ? ` · ${m.by}` : ""}
              </span>
              {m.notes && <span className="text-xs text-zinc-400">{m.notes}</span>}
              {m.serials.length ? (
                <span className="text-xs text-zinc-400">{t("stock.serialUndo")}</span>
              ) : (
                <button type="button" onClick={() => window.confirm(t("stock.confirmUndo")) && movesStore.remove(m.id)} className={DANGER}>
                  {t("stock.undo")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** What the stock is worth in each place shown (pieces × price), and the total. */
function StockValue({ t, places, items, moves, units, label }: { t: ReturnType<typeof useTranslations>; places: string[]; items: Item[]; moves: Move[]; units: Unit[]; label: (p: string) => string }) {
  const rows = places.map((p) => ({ p, ...stockValue(items, moves, units, p) })).filter((r) => r.value > 0 || r.unpriced > 0)
  if (!rows.length) return null
  const total = rows.reduce((a, r) => a + r.value, 0)
  const unpriced = rows.reduce((a, r) => a + r.unpriced, 0)
  return (
    <div className="grid gap-1 rounded-xl border border-white/10 p-3">
      <p className="text-sm text-zinc-100">{t("stock.value", { total: mxn(total) })}</p>
      <p className="font-mono text-xs text-zinc-400">{rows.map((r) => `${label(r.p)}: ${mxn(r.value)}`).join(" · ")}</p>
      {unpriced > 0 && <p className="text-xs text-amber-200">{t("stock.valueUnpriced", { n: unpriced })}</p>}
    </div>
  )
}
