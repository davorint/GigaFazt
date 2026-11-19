"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, PickField } from "@/components/surveys/SurveyFields"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { CATEGORIES, ROLES, catalogFile, effectiveOffer, mxn, newItem, newOffer, readCatalogFile, type Category, type Item, type Offer, type Role } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, deleteItem, importItems, saveItem, subscribeCatalog } from "@/lib/materials/store"
import { isKind, providerName, type Provider } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { countAt, placesUsed } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { usePlaceLabel } from "./places"
import { StockPanel } from "./StockPanel"
import { RollsPanel } from "./RollsPanel"
import { UnitsPanel } from "./UnitsPanel"

type T = ReturnType<typeof useTranslations>
const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const TABS = ["precios", "existencias", "bobinas", "equipos"] as const
type Tab = (typeof TABS)[number]

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const itemList = () => catalogSnapshot().items

/** Suppliers that sell goods (carriers that only sell internet aren't offered). */
export function useSellers(): Provider[] {
  return useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list.filter((p) => !isKind(p, "carrier") || p.kinds.length > 1)
}

/** Materials: prices and who sells each one, the stock in each place, and the ONTs by serial number (tabs, in the URL). */
export function MaterialsApp() {
  const t = useTranslations("materiales")
  const store = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const search = useSyncExternalStore(subscribeUrl, () => window.location.search, () => "")
  const raw = new URLSearchParams(search).get("t") ?? ""
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "precios"
  const setTab = (k: Tab) => {
    const p = new URLSearchParams(window.location.search)
    p.delete("m")
    if (k === "precios") p.delete("t")
    else p.set("t", k)
    window.history.pushState(null, "", p.toString() ? `?${p}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  if (!store.loaded) return null
  return (
    <div className="mt-6 grid gap-5">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="min-h-10 flex-1 rounded-lg px-4 text-sm text-zinc-300 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-selected:bg-white/10 aria-selected:text-foreground sm:flex-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={t(`tabs.${tab}`)}>
        {tab === "precios" && <PriceList t={t} items={store.items} />}
        {tab === "existencias" && <StockPanel items={store.items} />}
        {tab === "bobinas" && <RollsPanel />}
        {tab === "equipos" && <UnitsPanel items={store.items} />}
      </div>
    </div>
  )
}

function PriceList({ t, items }: { t: T; items: Item[] }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<Category | "">("")
  const [openId, setOpenId] = useOpenParam("m")
  useDropUntouched(openId, itemList, deleteItem)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list
  const nameOf = (o: Offer | null) => (o ? (o.supplierId ? providerName(providers.find((p) => p.id === o.supplierId) ?? ({ tradeName: "", legalName: "" } as Provider)) : o.supplier) : "")
  const needle = fold(q.trim())
  const shown = items.filter((x) => (!cat || x.category === cat) && (!needle || fold([x.name, x.notes, ...x.offers.flatMap((o) => [o.supplier, o.sku, nameOf(o)])].join(" ")).includes(needle)))
  const add = (v: Record<string, string>) => {
    const category = (CATEGORIES as readonly string[]).includes(v.category) ? (v.category as Category) : "otros"
    const it = newItem({ name: v.name, unit: v.unit || "pza", category })
    saveItem(it)
    setOpenId(it.id)
    setQ("")
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const got = readCatalogFile(await f.text())
    if (!got) return setMsg({ ok: false, text: t("badFile") })
    const r = importItems(got, true)
    setMsg({ ok: true, text: t("imported", { added: r.added, replaced: r.replaced }) })
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-zinc-300">{t("pricesIntro")}</p>
      <QuickAdd
        title={t("add")}
        submit={t("addSubmit")}
        initial={{ category: cat || "otros" }}
        fields={[
          { key: "name", label: t("name"), required: true },
          { key: "unit", label: t("unit"), placeholder: "pza" },
          { key: "category", label: t("category"), kind: "select", options: CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) })) },
        ]}
        onAdd={add}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => download(`materiales-${new Date().toISOString().slice(0, 10)}.json`, catalogFile(items))} className={BTN}>
          {t("export")}
        </button>
        <button type="button" onClick={() => file.current?.click()} className={BTN}>
          {t("import")}
        </button>
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text}
        </p>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("search")} value={q} onChange={setQ} hint={t("searchHint")} />
        <PickField label={t("category")} value={cat} onChange={setCat} options={[{ value: "" as const, label: t("allCategories") }, ...CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("count", { n: items.length, priced: items.filter((x) => x.price !== null).length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((x) => (
          <li key={x.id}>
            <ItemRow t={t} item={x} supplierName={nameOf(effectiveOffer(x))} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ItemRow({ t, item: x, supplierName, open, onToggle }: { t: T; item: Item; supplierName: string; open: boolean; onToggle: () => void }) {
  const up = (p: Partial<Item>) => saveItem({ ...x, ...p })
  const sellers = useSellers()
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const placeLabel = usePlaceLabel()
  const eff = effectiveOffer(x)
  const setOffer = (o: Offer) => up({ offers: x.offers.map((y) => (y.id === o.id ? o : y)) })
  const stock = placesUsed(moves, units)
    .map((p) => ({ p, n: countAt(x, moves, units, p) }))
    .filter((r) => r.n !== 0)
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{x.name}</span>
          <span className="font-mono text-xs text-zinc-400">
            {t(`categories.${x.category}`)} · {x.unit}
            {x.role ? ` · ${t(`roles.${x.role}`)}` : ""}
            {supplierName ? ` · ${supplierName}` : ""}
            {x.offers.length > 1 ? ` · ${t("offersCount", { n: x.offers.length })}` : ""}
          </span>
        </span>
        <span className={`shrink-0 font-mono text-sm ${x.price === null ? "text-amber-200" : "text-zinc-100"}`}>{x.price === null ? t("noPrice") : mxn(x.price)}</span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-white/10 p-3">
          <TextField label={t("name")} value={x.name} onChange={(v) => up({ name: v })} />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <PickField label={t("category")} value={x.category} onChange={(v) => up({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
            <TextField label={t("unit")} value={x.unit} onChange={(v) => up({ unit: v.slice(0, 20) })} />
            <PickField label={t("role")} value={x.role} onChange={(v) => up({ role: v as Role | "" })} hint={t("roleHint")} options={[{ value: "", label: t("noRole") }, ...ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))]} />
          </div>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("offers.title")}</legend>
            <p className="text-xs text-zinc-400">{t("offers.hint")}</p>
            {!x.offers.length && <p className="text-sm text-amber-200">{t("offers.none")}</p>}
            {x.offers.map((o, i) => {
              const named = sellers.find((p) => p.id === o.supplierId)
              const isEff = eff?.id === o.id
              return (
                <div key={o.id} role="group" aria-label={`${t("offers.one")} ${i + 1}`} className={`grid gap-3 rounded-lg border p-3 ${isEff ? "border-emerald-400/40" : "border-white/10"}`}>
                  {isEff && <p className="text-xs text-emerald-300">{x.offerId ? t("offers.chosen") : t("offers.cheapest")}</p>}
                  <div className="grid items-start gap-3 sm:grid-cols-2">
                    <PickField
                      label={t("offers.supplier")}
                      value={o.supplierId}
                      onChange={(supplierId) => setOffer({ ...o, supplierId })}
                      hint={t("supplierHint")}
                      options={[{ value: "", label: t("noSupplier") }, ...(o.supplierId && !named ? [{ value: o.supplierId, label: o.supplierId.slice(0, 8) }] : []), ...sellers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 6) }))]}
                    />
                    {!named && <TextField label={t("supplier")} value={o.supplier} onChange={(v) => setOffer({ ...o, supplier: v })} />}
                    <NumberField label={t("price")} unit="MXN" optional max={1e8} precision={2} value={o.price} onChange={(v) => setOffer({ ...o, price: v })} />
                    <DateField label={t("offers.date")} value={o.date} onChange={(v) => setOffer({ ...o, date: v })} />
                    <TextField label={t("sku")} value={o.sku} onChange={(v) => setOffer({ ...o, sku: v })} />
                    <TextField label={t("notes")} value={o.notes} onChange={(v) => setOffer({ ...o, notes: v })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
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
            <button type="button" onClick={() => up({ offers: [...x.offers, newOffer({ date: new Date().toLocaleDateString("sv-SE") })] })} className={SMALL}>
              {t("offers.add")}
            </button>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("stockTitle")}</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <NumberField label={t("minStock")} unit={x.unit} optional max={1e6} value={x.minStock} onChange={(v) => up({ minStock: v })} hint={t("minStockHint")} />
              <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
                <input type="checkbox" checked={x.serialized} onChange={(e) => up({ serialized: e.target.checked })} className="size-5 accent-white" />
                {t("serialized")}
              </label>
            </div>
            <p className="text-sm text-zinc-300">{stock.length ? stock.map((r) => `${placeLabel(r.p)}: ${r.n}`).join(" · ") : t("noStock")}</p>
          </fieldset>

          <AreaField label={t("notes")} value={x.notes} onChange={(v) => up({ notes: v })} rows={2} />
          <RecordHistory kind="materials" id={x.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove", { name: x.name })) && deleteItem(x.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
