"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, PickField } from "@/components/surveys/SurveyFields"
import { CATEGORIES, ROLES, catalogFile, mxn, readCatalogFile, type Category, type Item, type Role } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, deleteItem, importItems, saveItem, subscribeCatalog } from "@/lib/materials/store"
import { newId } from "@/lib/survey/id"

const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

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

/** The master materials list: search, filter by category, edit each item in place, export and import. */
export function MaterialsApp() {
  const t = useTranslations("materiales")
  const store = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<Category | "">("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  if (!store.loaded) return null
  const items = store.items
  const shown = items.filter((x) => (!cat || x.category === cat) && (!q.trim() || fold(`${x.name} ${x.supplier} ${x.sku}`).includes(fold(q.trim()))))
  const add = () => {
    const it: Item = { id: newId(), name: t("newItem"), category: cat || "otros", unit: "pza", price: null, role: "", supplier: "", sku: "", notes: "" }
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
    <div className="mt-6 grid gap-4">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={add} className={PRIMARY}>
          {t("add")}
        </button>
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
        <TextField label={t("search")} value={q} onChange={setQ} />
        <PickField label={t("category")} value={cat} onChange={setCat} options={[{ value: "" as const, label: t("allCategories") }, ...CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("count", { n: items.length, priced: items.filter((x) => x.price !== null).length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((x) => (
          <li key={x.id}>
            <ItemRow t={t} item={x} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ItemRow({ t, item: x, open, onToggle }: { t: ReturnType<typeof useTranslations>; item: Item; open: boolean; onToggle: () => void }) {
  const up = (p: Partial<Item>) => saveItem({ ...x, ...p })
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{x.name}</span>
          <span className="font-mono text-xs text-zinc-400">
            {t(`categories.${x.category}`)} · {x.unit}
            {x.role ? ` · ${t(`roles.${x.role}`)}` : ""}
          </span>
        </span>
        <span className={`shrink-0 font-mono text-sm ${x.price === null ? "text-amber-200" : "text-zinc-100"}`}>{x.price === null ? t("noPrice") : mxn(x.price)}</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-white/10 p-3">
          <TextField label={t("name")} value={x.name} onChange={(v) => up({ name: v })} />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <PickField label={t("category")} value={x.category} onChange={(v) => up({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
            <TextField label={t("unit")} value={x.unit} onChange={(v) => up({ unit: v.slice(0, 20) })} />
            <NumberField label={t("price")} unit="MXN" optional max={1e8} value={x.price} onChange={(v) => up({ price: v })} />
            <PickField label={t("role")} value={x.role} onChange={(v) => up({ role: v as Role | "" })} hint={t("roleHint")} options={[{ value: "", label: t("noRole") }, ...ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))]} />
            <TextField label={t("supplier")} value={x.supplier} onChange={(v) => up({ supplier: v })} />
            <TextField label={t("sku")} value={x.sku} onChange={(v) => up({ sku: v })} />
          </div>
          <AreaField label={t("notes")} value={x.notes} onChange={(v) => up({ notes: v })} rows={2} />
          <button
            type="button"
            onClick={() => window.confirm(t("confirmRemove", { name: x.name })) && deleteItem(x.id)}
            className="h-10 w-fit rounded-full border border-red-400/30 px-4 text-sm text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
