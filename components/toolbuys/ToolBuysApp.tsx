"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, PickField } from "@/components/surveys/SurveyFields"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { useSellers } from "@/components/materials/PriceList"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { providerName } from "@/lib/providers/model"
import { readState } from "@/lib/sync/state"
import { BUY_STATUSES, PRIORITIES, bestOffer, buyIntoTools, buyLabel, buyTotal, isOpen, newBuyOffer, newToolBuy, type BuyOffer, type BuyStatus, type Priority, type ToolBuy } from "@/lib/toolbuys/model"
import { toolBuysStore } from "@/lib/toolbuys/store"
import { TOOL_CATEGORIES, type ToolCategory } from "@/lib/tools/model"
import { saveTool, subscribeTools, toolsServerSnapshot, toolsSnapshot } from "@/lib/tools/store"
import { SpecFields, specSummary } from "@/components/interno/SpecFields"
import { TOOL_SPECS } from "@/lib/tools/specs"

type T = ReturnType<typeof useTranslations>
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "inline-flex min-h-10 w-fit items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const LINK = "inline-flex min-h-9 w-fit items-center text-xs text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white"
const SHOW = ["abiertas", "todas", "compradas", "descartadas"] as const
type Show = (typeof SHOW)[number]
const STATUS_TONE: Record<BuyStatus, string> = { idea: "text-zinc-400", cotizado: "text-sky-300", aprobado: "text-amber-200", comprado: "text-emerald-300", descartado: "text-zinc-500 line-through" }

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

/**
 * Compras de herramientas (/interno/admin/compras-herramientas, owner 2026-11-18): candidate models for each tool we
 * need, with their offers, priority and status, grouped by need to compare; options seen on the web to add; "Marcar
 * comprada" fills the tool in Herramientas.
 */
export function ToolBuysApp() {
  const t = useTranslations("comprasHerramientas")
  const tc = useTranslations("herramientas")
  const store = useSyncExternalStore(toolBuysStore.subscribe, toolBuysStore.snapshot, toolBuysStore.serverSnapshot)
  const tools = useSyncExternalStore(subscribeTools, toolsSnapshot, toolsServerSnapshot)
  const [openId, setOpenId] = useOpenParam("o")
  const [show, setShow] = useState<Show>("abiertas")
  const [q, setQ] = useState("")
  if (!store.loaded || !tools.loaded) return null
  const list = store.list
  const needle = fold(q)
  const shown = list.filter((x) => {
    const okShow = show === "todas" || (show === "abiertas" ? isOpen(x) : show === "compradas" ? x.status === "comprado" : x.status === "descartado")
    return okShow && (!needle || fold([x.need, x.brand, x.model, x.specs, x.notes, ...x.offers.map((o) => o.store)].join(" ")).includes(needle))
  })
  const groups = new Map<string, ToolBuy[]>()
  for (const x of shown) {
    const k = x.need.trim() || t("noNeed")
    groups.set(k, [...(groups.get(k) ?? []), x])
  }
  const needs = [...new Set([...tools.list.map((x) => x.name), ...list.map((x) => x.need)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))

  const add = (v: Record<string, string>) => {
    const category = (TOOL_CATEGORIES as readonly string[]).includes(v.category) ? (v.category as ToolCategory) : "otros"
    const x = newToolBuy({ need: v.need.trim(), brand: v.brand.trim(), model: v.model.trim(), category, by: readState().name })
    toolBuysStore.save(x)
    setOpenId(x.id)
  }

  return (
    <div className="mt-6 grid gap-6">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <QuickAdd
        title={t("add")}
        submit={t("addSubmit")}
        initial={{ category: "empalme" }}
        fields={[
          { key: "need", label: t("need"), required: true, placeholder: t("needPlaceholder") },
          { key: "brand", label: t("brand") },
          { key: "model", label: t("model") },
          { key: "category", label: t("category"), kind: "select", options: TOOL_CATEGORIES.map((c) => ({ value: c, label: tc(`categories.${c}`) })) },
        ]}
        onAdd={add}
      />

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("search")} value={q} onChange={setQ} />
        <PickField label={t("show")} value={show} onChange={setShow} options={SHOW.map((s) => ({ value: s, label: t(`shows.${s}`) }))} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("count", { open: list.filter(isOpen).length, n: list.length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}

      {[...groups].map(([need, items]) => (
        <section key={need} aria-label={need} className="grid gap-2">
          <h2 className="text-base font-medium text-foreground">
            {need} <span className="font-mono text-xs text-zinc-400">· {t("groupCount", { n: items.length })}</span>
          </h2>
          <ul className="grid gap-2">
            {items
              .sort((a, b) => (buyTotal(a) ?? Infinity) - (buyTotal(b) ?? Infinity))
              .map((x) => (
                <li key={x.id}>
                  <BuyRow t={t} tc={tc} x={x} needs={needs} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function BuyRow({ t, tc, x, needs, open, onToggle }: { t: T; tc: T; x: ToolBuy; needs: string[]; open: boolean; onToggle: () => void }) {
  const sellers = useSellers()
  const [done, setDone] = useState("")
  const up = (p: Partial<ToolBuy>) => toolBuysStore.save({ ...x, ...p })
  const best = bestOffer(x)
  const total = buyTotal(x)
  const setOffer = (o: BuyOffer) => up({ offers: x.offers.map((y) => (y.id === o.id ? o : y)) })
  const storeOf = (o: BuyOffer) => {
    const p = o.supplierId ? sellers.find((s) => s.id === o.supplierId) : undefined
    return (p ? providerName(p) : o.store) || "—"
  }
  const markBought = () => {
    if (!window.confirm(t("confirmBought", { name: buyLabel(x) }))) return
    const r = buyIntoTools(x, toolsSnapshot().list, localToday())
    saveTool(r.tool)
    toolBuysStore.save(r.option)
    setDone(t("boughtDone"))
  }
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{buyLabel(x)}</span>
          <span className="font-mono text-xs text-zinc-400">
            <span className={STATUS_TONE[x.status]}>{t(`statuses.${x.status}`)}</span> · {t(`priorities.${x.priority}`)}
            {best ? ` · ${storeOf(best)}` : ""}
            {x.offers.length > 1 ? ` · ${t("offersCount", { n: x.offers.length })}` : ""}
            {x.quantity > 1 ? ` · ×${x.quantity}` : ""}
            {x.ptype ? ` · ${specSummary(tc, TOOL_SPECS, x.category, x.ptype, x.traits)}` : ""}
          </span>
        </span>
        <span className={`shrink-0 font-mono text-sm ${total === null ? "text-amber-200" : "text-zinc-100"}`}>{total === null ? t("noPrice") : mxn(total)}</span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-white/10 p-3">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <PickField label={t("need")} value={x.need} onChange={(v) => up({ need: v })} hint={t("needHint")} options={[...(needs.includes(x.need) ? [] : [{ value: x.need, label: x.need || t("noNeed") }]), ...needs.map((n) => ({ value: n, label: n }))]} />
            <PickField label={t("category")} value={x.category} onChange={(v) => up({ category: v, ptype: "", traits: {} })} options={TOOL_CATEGORIES.map((c) => ({ value: c, label: tc(`categories.${c}`) }))} />
            <TextField label={t("brand")} value={x.brand} onChange={(v) => up({ brand: v.slice(0, 100) })} />
            <TextField label={t("model")} value={x.model} onChange={(v) => up({ model: v.slice(0, 150) })} />
            <NumberField label={t("quantity")} unit={t("pieces")} integer min={1} max={10000} value={x.quantity} onChange={(v) => up({ quantity: v ?? 1 })} />
            <PickField label={t("priority")} value={x.priority} onChange={(v: Priority) => up({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: t(`priorities.${p}`) }))} />
            <PickField label={t("status")} value={x.status} onChange={(v: BuyStatus) => up({ status: v })} hint={t("statusHint")} options={BUY_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
          </div>
          <SpecFields t={tc} cat={TOOL_SPECS} category={x.category} ptype={x.ptype} traits={x.traits} onChange={up} />
          <AreaField label={t("specs")} value={x.specs} onChange={(v) => up({ specs: v.slice(0, 1000) })} rows={2} />

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("offers.title")}</legend>
            <p className="text-xs text-zinc-400">{t("offers.hint")}</p>
            {!x.offers.length && <p className="text-sm text-amber-200">{t("offers.none")}</p>}
            {x.offers.map((o, i) => {
              const named = sellers.find((p) => p.id === o.supplierId)
              const isBest = best?.id === o.id
              return (
                <div key={o.id} role="group" aria-label={`${t("offers.one")} ${i + 1}`} className={`grid gap-3 rounded-lg border p-3 ${isBest ? "border-emerald-400/40" : "border-white/10"}`}>
                  {isBest && <p className="text-xs text-emerald-300">{x.offerId ? t("offers.chosen") : t("offers.cheapest")}</p>}
                  <div className="grid items-start gap-3 sm:grid-cols-2">
                    <PickField
                      label={t("offers.supplier")}
                      value={o.supplierId}
                      onChange={(supplierId) => setOffer({ ...o, supplierId })}
                      options={[{ value: "", label: t("offers.noSupplier") }, ...(o.supplierId && !named ? [{ value: o.supplierId, label: o.supplierId.slice(0, 8) }] : []), ...sellers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 6) }))]}
                    />
                    {!named && <TextField label={t("offers.store")} value={o.store} onChange={(v) => setOffer({ ...o, store: v.slice(0, 200) })} />}
                    <NumberField label={t("offers.price")} unit="MXN" optional max={1e8} precision={2} value={o.price} onChange={(v) => setOffer({ ...o, price: v })} />
                    <DateField label={t("offers.date")} value={o.date} onChange={(v) => setOffer({ ...o, date: v })} />
                    <TextField label={t("offers.url")} value={o.url} onChange={(v) => setOffer({ ...o, url: v.trim().slice(0, 500) })} />
                    <TextField label={t("offers.notes")} value={o.notes} onChange={(v) => setOffer({ ...o, notes: v.slice(0, 500) })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/^https?:\/\//.test(o.url) && (
                      <a href={o.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                        {t("offers.open")}
                      </a>
                    )}
                    {x.offers.length > 1 && x.offerId !== o.id && (
                      <button type="button" onClick={() => up({ offerId: o.id })} className={SMALL}>
                        {t("offers.choose")}
                      </button>
                    )}
                    {x.offerId === o.id && (
                      <button type="button" onClick={() => up({ offerId: "" })} className={SMALL}>
                        {t("offers.useCheapest")}
                      </button>
                    )}
                    <button type="button" onClick={() => up({ offers: x.offers.filter((y) => y.id !== o.id), offerId: x.offerId === o.id ? "" : x.offerId })} className={DANGER}>
                      {t("offers.remove")}
                    </button>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={() => up({ offers: [...x.offers, newBuyOffer({ date: localToday() })] })} className={SMALL}>
              {t("offers.add")}
            </button>
          </fieldset>

          <AreaField label={t("notes")} value={x.notes} onChange={(v) => up({ notes: v.slice(0, 2000) })} rows={2} />

          <div className="grid gap-2">
            {x.status === "comprado" && x.toolId ? (
              <a href={`/interno/admin/herramientas?h=${x.toolId}`} className={LINK}>
                {t("bought")}
              </a>
            ) : (
              x.status !== "descartado" && (
                <button type="button" onClick={markBought} className={PRIMARY}>
                  {t("markBought")}
                </button>
              )
            )}
            {done && (
              <p role="status" className="text-sm text-emerald-300">
                {done}
              </p>
            )}
          </div>

          <RecordHistory kind="toolbuys" id={x.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove", { name: buyLabel(x) })) && toolBuysStore.remove(x.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
