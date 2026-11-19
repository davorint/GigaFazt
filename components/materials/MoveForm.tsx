"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { AreaField, DateField, PickField } from "@/components/surveys/SurveyFields"
import { localToday } from "@/lib/clients/from-lead"
import type { Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, saveClient, subscribeClients } from "@/lib/clients/store"
import type { Item } from "@/lib/materials/catalog"
import { newId } from "@/lib/survey/id"
import { readState } from "@/lib/sync/state"
import { BAJA_REASONS, BODEGA, ENDS, MOVE_KINDS, applyToUnits, checkMove, newMove, normSerial, placeSite, stockAt, unitsAt, type BajaReason, type Move, type MoveKind, type Unit } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { ClientPick } from "@/components/clients/ClientPick"
import { usePlaceLabel, usePlaceOptions } from "./places"

type Line = { key: string; itemId: string; qty: number | null; serials: string[]; text: string }
const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const blankLine = (itemId = "", qty: number | null = null): Line => ({ key: newId(), itemId, qty, serials: [], text: "" })

/** What an installation usually takes: the ONT, the drop cable and the client's connectors (by their role in Materiales). */
function installLines(items: Item[]): Line[] {
  const by = (r: string) => items.find((x) => x.role === r)
  return [by("ont"), by("drop-m"), by("client-connector")].filter((x): x is Item => !!x).map((x) => blankLine(x.id, x.role === "client-connector" ? 2 : null))
}

/** Records one stock movement (several materials at once: an installation takes the ONT, the cable and connectors). */
export function MoveForm({ items, kind: initialKind, itemId, notes: initialNotes = "", onDone }: { items: Item[]; kind: MoveKind; itemId?: string; notes?: string; onDone: (msg: string) => void }) {
  const t = useTranslations("materiales")
  const placeOptions = usePlaceOptions()
  const placeLabel = usePlaceLabel()
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const [kind, setKind] = useState<MoveKind>(initialKind)
  const [date, setDate] = useState(localToday())
  const [from, setFrom] = useState(BODEGA)
  const [to, setTo] = useState(BODEGA)
  const [clientId, setClientId] = useState("")
  const [notes, setNotes] = useState(initialNotes)
  const [lines, setLines] = useState<Line[]>(() => (itemId ? [blankLine(itemId)] : initialKind === "instalacion" ? installLines(items) : [blankLine()]))
  const [retired, setRetired] = useState({ serial: "", works: true })
  const [reason, setReason] = useState<BajaReason>("danado")
  const [problems, setProblems] = useState<string[]>([])
  const ends = ENDS[kind]
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, "es"))
  const setLine = (l: Line) => setLines(lines.map((x) => (x.key === l.key ? l : x)))
  const atClient = units.filter((u) => u.state === "cliente" && u.clientId === clientId)

  const changeKind = (k: MoveKind) => {
    setKind(k)
    setProblems([])
    if (k === "instalacion" && lines.every((l) => !l.itemId)) setLines(installLines(items))
  }

  const save = () => {
    const by = readState().name
    const batch = newId()
    const built: Move[] = []
    const errs: string[] = []
    const warns: string[] = []
    for (const l of lines) {
      const item = items.find((x) => x.id === l.itemId)
      if (!l.itemId && lines.length > 1) continue
      const serials = item?.serialized ? (ends.from && kind !== "devolucion" ? l.serials : l.text.split(/[\s,;]+/).map(normSerial).filter(Boolean)) : []
      const m = newMove({
        kind,
        date,
        itemId: l.itemId,
        qty: item?.serialized ? serials.length : (l.qty ?? 0),
        from: ends.from ? from : "",
        to: ends.to ? to : "",
        clientId: ends.client ? clientId : "",
        serials,
        batch,
        reason: kind === "baja" ? reason : "",
        notes,
        by,
      })
      if (item?.serialized && kind === "ajuste") errs.push(t("move.errors.serialAjuste", { name: item.name }))
      const c = checkMove(m, item, units, moves)
      for (const e of c.errors) errs.push(t(`move.errors.${e}`, { name: item?.name ?? "" }))
      for (const w of c.warnings) {
        const [k, s] = w.split(":")
        warns.push(t(`move.warnings.${k}`, { name: item?.name ?? "", serial: s ?? "", n: stockAt(moves, m.itemId, m.from) }))
      }
      built.push(m)
    }
    if (!built.length) errs.push(t("move.errors.item"))
    if (kind === "reemplazo" && !retired.serial && !lines.some((l) => items.find((x) => x.id === l.itemId && !x.serialized))) warns.push(t("move.warnings.noRetired"))
    if (errs.length) return setProblems([...new Set(errs)])
    if (warns.length && !window.confirm(`${[...new Set(warns)].join("\n")}\n\n${t("move.saveAnyway")}`)) return
    // The replaced unit comes back to the place it left from (still works) or stays there damaged.
    if (kind === "reemplazo" && retired.serial) {
      const u = units.find((x) => normSerial(x.serial) === normSerial(retired.serial))
      built.push(newMove({ kind: retired.works ? "devolucion" : "baja", date, itemId: u?.itemId ?? lines[0].itemId, qty: 1, from: retired.works ? "" : from, to: retired.works ? from : "", clientId, serials: [retired.serial], batch, notes: t("move.retiredNote"), by }))
    }
    // Units follow the movements, in order.
    let current: Unit[] = units
    const touched = new Map<string, Unit>()
    for (const m of built) {
      if (!m.serials.length) continue
      for (const u of applyToUnits(current, m)) {
        touched.set(u.id, u)
        current = current.some((x) => x.id === u.id) ? current.map((x) => (x.id === u.id ? u : x)) : [...current, u]
      }
    }
    movesStore.save(...built)
    unitsStore.save(...touched.values())
    // An ONT installed at a client: its serial goes on the client's internet service.
    const ontSerial = (kind === "instalacion" || kind === "reemplazo") && built.find((m) => m.serials.length && items.find((x) => x.id === m.itemId)?.role === "ont")?.serials[0]
    const client = clients.find((c) => c.id === clientId)
    if (ontSerial && client) {
      const k = client.services.findIndex((s) => s.type === "internet" && s.status !== "cancelado")
      if (k >= 0) saveClient({ ...client, services: client.services.map((s, i) => (i === k ? { ...s, ontSn: ontSerial } : s)), updatedAt: new Date().toISOString() } as Client)
    }
    onDone(t("move.saved", { n: built.length }))
  }

  return (
    <section aria-label={t("move.title")} className="grid gap-4 rounded-xl border border-white/20 p-4">
      <h3 className="text-lg font-medium text-foreground">{t(`move.kinds.${kind}`)}</h3>
      <p className="text-xs text-zinc-400">{t(`move.hints.${kind}`)}</p>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <PickField label={t("move.kind")} value={kind} onChange={changeKind} options={MOVE_KINDS.map((k) => ({ value: k, label: t(`move.kinds.${k}`) }))} />
        <DateField label={t("move.date")} value={date} onChange={setDate} />
        {ends.from && <PickField label={t("move.from")} value={from} onChange={setFrom} options={placeOptions} />}
        {ends.to && <PickField label={kind === "ajuste" ? t("move.place") : t("move.to")} value={to} onChange={setTo} options={placeOptions} />}
        {kind === "baja" && <PickField label={t("move.reason")} value={reason} onChange={setReason} options={BAJA_REASONS.map((r) => ({ value: r, label: t(`move.reasons.${r}`) }))} />}
      </div>
      {ends.client && <ClientPick label={t("move.client")} searchLabel={t("move.clientSearch")} searchHint={t("move.clientSearchHint")} noneLabel={t("move.noClient")} value={clientId} onChange={setClientId} siteId={placeSite(ends.from ? from : to)} />}

      <div className="grid gap-3">
        {lines.map((l, i) => {
          const item = items.find((x) => x.id === l.itemId)
          const available = item?.serialized ? unitsAt(units, item.id, from).filter((u) => !l.serials.includes(u.serial)) : []
          const typed = item?.serialized && (!ends.from || kind === "devolucion")
          return (
            <div key={l.key} role="group" aria-label={`${t("move.line")} ${i + 1}`} className="grid gap-3 rounded-lg border border-white/10 p-3">
              <PickField label={t("move.item")} value={l.itemId} onChange={(itemId) => setLine({ ...l, itemId, serials: [], text: "" })} options={[{ value: "", label: t("move.noItem") }, ...sorted.map((x) => ({ value: x.id, label: `${x.name}${x.serialized ? ` · ${t("move.bySerial")}` : ""}` }))]} />
              {item && !item.serialized && (
                <NumberField label={kind === "ajuste" ? t("move.qtyAdjust") : t("move.qty")} unit={item.unit} optional min={kind === "ajuste" ? -1e6 : 0} max={1e6} value={l.qty} onChange={(qty) => setLine({ ...l, qty })} hint={ends.from ? t("move.has", { n: stockAt(moves, item.id, from), place: placeLabel(from) }) : kind === "ajuste" ? t("move.adjustHint", { n: stockAt(moves, item.id, to) }) : undefined} />
              )}
              {item?.serialized && typed && (
                <AreaField label={t("move.serials")} value={l.text} onChange={(text) => setLine({ ...l, text })} hint={kind === "devolucion" && atClient.length ? t("move.clientHas", { serials: atClient.map((u) => u.serial).join(", ") }) : t("move.serialsHint")} rows={3} />
              )}
              {item?.serialized && !typed && (
                <div className="grid gap-2">
                  <PickField
                    label={t("move.pickSerial")}
                    value=""
                    onChange={(s) => s && setLine({ ...l, serials: [...l.serials, s] })}
                    hint={available.length ? t("move.available", { n: available.length, place: placeLabel(from) }) : t("move.noneAvailable", { place: placeLabel(from) })}
                    options={[{ value: "", label: t("move.addSerial") }, ...available.map((u) => ({ value: u.serial, label: u.serial }))]}
                  />
                  {l.serials.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {l.serials.map((s) => (
                        <li key={s}>
                          <button type="button" onClick={() => setLine({ ...l, serials: l.serials.filter((x) => x !== s) })} className={SMALL} aria-label={t("move.removeSerial", { serial: s })}>
                            {s} ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className={SMALL}>
                  {t("move.removeLine")}
                </button>
              )}
            </div>
          )
        })}
        <button type="button" onClick={() => setLines([...lines, blankLine()])} className={SMALL}>
          {t("move.addLine")}
        </button>
      </div>

      {kind === "reemplazo" && (
        <div className="grid items-start gap-4 rounded-lg border border-white/10 p-3 sm:grid-cols-2">
          <PickField
            label={t("move.retired")}
            value={retired.serial}
            onChange={(serial) => setRetired({ ...retired, serial })}
            hint={t("move.retiredHint")}
            options={[{ value: "", label: t("move.noRetired") }, ...atClient.map((u) => ({ value: u.serial, label: u.serial }))]}
          />
          {retired.serial && (
            <PickField label={t("move.retiredState")} value={retired.works ? "si" : "no"} onChange={(v) => setRetired({ ...retired, works: v === "si" })} options={[{ value: "si", label: t("move.retiredWorks") }, { value: "no", label: t("move.retiredBroken") }]} />
          )}
        </div>
      )}

      <AreaField label={t("move.notes")} value={notes} onChange={setNotes} rows={2} />
      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 text-sm text-red-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className={PRIMARY}>
          {t("move.save")}
        </button>
        <button type="button" onClick={() => onDone("")} className={SMALL}>
          {t("move.cancel")}
        </button>
      </div>
    </section>
  )
}
