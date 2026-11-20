"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import { localToday } from "@/lib/clients/from-lead"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AddButton, AreaField, GRID, ItemCard, PickField } from "@/components/surveys/SurveyFields"
import { mxn } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { PROVIDER_KINDS, RFC, isKind, newProvider, providerName, providersFile, readProvidersFile, type Provider, type ProviderKind, type Score } from "@/lib/providers/model"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { deleteProvider, importProviders, providersServerSnapshot, providersSnapshot, saveProvider, subscribeProviders } from "@/lib/providers/store"
import { newId } from "@/lib/survey/id"

type T = ReturnType<typeof useTranslations>
const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Every provider: search, filter by kind, edit each one in place, export and import. */
const providerList = () => providersSnapshot().list

export function ProvidersApp() {
  const t = useTranslations("proveedores")
  const store = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot)
  const [q, setQ] = useState("")
  const [kind, setKind] = useState<ProviderKind | "">("")
  // The open provider is in the URL (?p=<id>), so the back button closes it.
  const [openId, setOpenId] = useOpenParam("p")
  useDropUntouched(openId, providerList, deleteProvider)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  if (!store.loaded) return null
  const list = [...store.list].sort((a, b) => providerName(a).localeCompare(providerName(b), "es"))
  const shown = list.filter((p) => (!kind || isKind(p, kind)) && (!q.trim() || fold([p.tradeName, p.legalName, p.rfc, p.notes, p.carrier.zones, ...p.contacts.map((c) => c.name)].join(" ")).includes(fold(q.trim()))))
  const add = (v: Record<string, string>) => {
    const k = (PROVIDER_KINDS as readonly string[]).includes(v.kind) ? (v.kind as ProviderKind) : "material"
    const p = newProvider(k, v.name)
    saveProvider(p)
    setOpenId(p.id)
    setQ("")
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const got = readProvidersFile(await f.text())
    if (!got) return setMsg({ ok: false, text: t("badFile") })
    const r = importProviders(got)
    setMsg({ ok: true, text: t("imported", { added: r.added, replaced: r.replaced, kept: r.kept }) })
  }
  return (
    <div className="mt-6 grid gap-4">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <QuickAdd
        title={t("add")}
        submit={t("addSubmit")}
        initial={{ kind: kind || "material" }}
        fields={[
          { key: "name", label: t("tradeName"), required: true },
          { key: "kind", label: t("kind"), kind: "select", options: PROVIDER_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })) },
        ]}
        onAdd={add}
      />
      <div className="flex flex-wrap gap-2">
        {list.length > 0 && (
          <button type="button" onClick={() => download(`proveedores-${localToday()}.json`, providersFile(list))} className={BTN}>
            {t("export")}
          </button>
        )}
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
      <div className={GRID}>
        <TextField label={t("search")} value={q} onChange={setQ} />
        <PickField label={t("kind")} value={kind} onChange={setKind} options={[{ value: "" as const, label: t("allKinds") }, ...PROVIDER_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("count", { n: list.length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((p) => (
          <li key={p.id}>
            <Row t={t} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ t, p, open, onToggle }: { t: T; p: Provider; open: boolean; onToggle: () => void }) {
  const main = p.contacts[0]
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full gap-0.5 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="text-sm text-zinc-100">{providerName(p) || t("untitled")}</span>
        <span className="font-mono text-xs text-zinc-400">
          {p.kinds.map((k) => t(`kinds.${k}`)).join(" · ")}
          {main ? ` · ${main.name}${main.phone ? ` ${main.phone}` : ""}` : ""}
        </span>
      </button>
      {open && <Editor t={t} p={p} />}
    </div>
  )
}

function Editor({ t, p }: { t: T; p: Provider }) {
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const up = (x: Partial<Provider>) => saveProvider({ ...p, ...x })
  const upTerms = (x: Partial<Provider["terms"]>) => up({ terms: { ...p.terms, ...x } })
  const upCarrier = (x: Partial<Provider["carrier"]>) => up({ carrier: { ...p.carrier, ...x } })
  // Every material this provider quotes, at its price (the cheapest supplier may be another one).
  const sells = catalog.items.filter((x) => x.offers.some((o) => o.supplierId === p.id))
  const quoted = (x: (typeof sells)[number]) => x.offers.find((o) => o.supplierId === p.id)?.price ?? null
  const scoreOptions = (key: "stars" | "priceLevels") => [{ value: "", label: t(`${key}.none`) }, ...["1", "2", "3", "4", "5"].map((s) => ({ value: s, label: t(`${key}.${s}`) }))]
  const setScore = (k: keyof Provider["rating"], v: string) => up({ rating: { ...p.rating, [k]: v ? (Number(v) as Score) : null } })
  const rfcBad = p.rfc.trim() !== "" && !RFC.test(p.rfc.trim())
  return (
    <div className="grid gap-5 border-t border-white/10 p-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("kindsTitle")}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {PROVIDER_KINDS.map((k) => (
            <label key={k} className="flex min-h-9 items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                className="size-5 accent-white"
                checked={isKind(p, k)}
                onChange={(e) => {
                  const kinds = e.target.checked ? [...p.kinds, k] : p.kinds.filter((x) => x !== k)
                  if (kinds.length) up({ kinds })
                }}
              />
              {t(`kinds.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4">
        <p className="text-sm font-medium text-foreground">{t("company")}</p>
        <div className={GRID}>
          <TextField label={t("tradeName")} value={p.tradeName} onChange={(v) => up({ tradeName: v })} />
          <TextField label={t("legalName")} value={p.legalName} onChange={(v) => up({ legalName: v })} />
          <TextField label={t("rfc")} value={p.rfc} onChange={(v) => up({ rfc: v.toUpperCase().slice(0, 13) })} hint={rfcBad ? t("rfcBad") : undefined} />
          <TextField label={t("website")} value={p.website} onChange={(v) => up({ website: v })} type="url" />
        </div>
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-medium text-foreground">{t("contacts")}</p>
        {p.contacts.map((c, k) => (
          <ItemCard key={c.id} title={c.name || t("contact", { n: k + 1 })} removeLabel={t("removeContact")} onRemove={() => up({ contacts: p.contacts.filter((x) => x.id !== c.id) })}>
            <div className={GRID}>
              {(["name", "role", "phone", "whatsapp", "email"] as const).map((f) => (
                <TextField key={f} label={t(f === "name" ? "contactName" : f === "role" ? "contactRole" : f)} value={c[f]} onChange={(v) => up({ contacts: p.contacts.map((x) => (x.id === c.id ? { ...x, [f]: v } : x)) })} type={f === "phone" || f === "whatsapp" ? "tel" : f === "email" ? "email" : "text"} />
              ))}
            </div>
          </ItemCard>
        ))}
        <AddButton disabled={p.contacts.length >= 30} onClick={() => up({ contacts: [...p.contacts, { id: newId(), name: "", role: "", phone: "", whatsapp: "", email: "" }] })}>
          {t("addContact")}
        </AddButton>
      </div>
      <div className="grid gap-4">
        <p className="text-sm font-medium text-foreground">{t("terms")}</p>
        <div className={GRID}>
          <NumberField label={t("creditDays")} unit={t("days")} integer optional max={365} value={p.terms.creditDays} onChange={(v) => upTerms({ creditDays: v })} />
          <NumberField label={t("deliveryDays")} unit={t("days")} integer optional max={365} value={p.terms.deliveryDays} onChange={(v) => upTerms({ deliveryDays: v })} />
          <TextField label={t("minOrder")} value={p.terms.minOrder} onChange={(v) => upTerms({ minOrder: v })} />
          <TextField label={t("warranty")} value={p.terms.warranty} onChange={(v) => upTerms({ warranty: v })} />
          <TextField label={t("shipping")} value={p.terms.shipping} onChange={(v) => upTerms({ shipping: v })} />
        </div>
        <AreaField label={t("bank")} hint={t("bankHint")} value={p.terms.bank} onChange={(v) => upTerms({ bank: v })} rows={2} />
      </div>
      {isKind(p, "carrier") && (
        <div className="grid gap-4 rounded-xl border border-white/10 p-3">
          <p className="text-sm font-medium text-foreground">{t("carrierTitle")}</p>
          <AreaField label={t("zones")} hint={t("zonesHint")} value={p.carrier.zones} onChange={(v) => upCarrier({ zones: v })} rows={2} />
          <div className="grid gap-3">
            <p className="text-sm text-zinc-200">{t("offers")}</p>
            {p.carrier.offers.map((o, k) => (
              <ItemCard key={o.id} title={o.mbps ? `${o.mbps} Mbps` : t("offer", { n: k + 1 })} removeLabel={t("removeContact")} onRemove={() => upCarrier({ offers: p.carrier.offers.filter((x) => x.id !== o.id) })}>
                <div className={GRID}>
                  <NumberField label={t("mbps")} unit="Mbps" optional max={1e6} value={o.mbps} onChange={(v) => upCarrier({ offers: p.carrier.offers.map((x) => (x.id === o.id ? { ...x, mbps: v } : x)) })} />
                  <NumberField label={t("monthly")} unit={t("perMonth")} optional max={1e8} value={o.monthly} onChange={(v) => upCarrier({ offers: p.carrier.offers.map((x) => (x.id === o.id ? { ...x, monthly: v } : x)) })} />
                </div>
                <TextField label={t("offerNotes")} value={o.notes} onChange={(v) => upCarrier({ offers: p.carrier.offers.map((x) => (x.id === o.id ? { ...x, notes: v } : x)) })} />
              </ItemCard>
            ))}
            <AddButton disabled={p.carrier.offers.length >= 30} onClick={() => upCarrier({ offers: [...p.carrier.offers, { id: newId(), mbps: null, monthly: null, notes: "" }] })}>
              {t("addOffer")}
            </AddButton>
          </div>
          <div className={GRID}>
            <PickField label={t("ip")} value={p.carrier.ip} onChange={(ip) => upCarrier({ ip })} options={(["", "publica", "nat", "ambas"] as const).map((x) => ({ value: x, label: t(`ips.${x || "none"}`) }))} />
            <NumberField label={t("installDays")} unit={t("days")} integer optional max={3650} value={p.carrier.installDays} onChange={(v) => upCarrier({ installDays: v })} />
            <TextField label={t("sla")} value={p.carrier.sla} onChange={(v) => upCarrier({ sla: v })} />
            <TextField label={t("support")} value={p.carrier.support} onChange={(v) => upCarrier({ support: v })} />
          </div>
        </div>
      )}
      <div className="grid gap-4">
        <p className="text-sm font-medium text-foreground">{t("ratingTitle")}</p>
        <div className={GRID}>
          <PickField label={t("quality")} value={p.rating.quality ? String(p.rating.quality) : ""} onChange={(v) => setScore("quality", v)} options={scoreOptions("stars")} />
          <PickField label={t("response")} value={p.rating.response ? String(p.rating.response) : ""} onChange={(v) => setScore("response", v)} options={scoreOptions("stars")} />
          <PickField label={t("price")} value={p.rating.price ? String(p.rating.price) : ""} onChange={(v) => setScore("price", v)} options={scoreOptions("priceLevels")} />
        </div>
        <AreaField label={t("notes")} value={p.notes} onChange={(v) => up({ notes: v })} />
        <AreaField label={t("docs")} hint={t("docsHint")} value={p.docs} onChange={(v) => up({ docs: v })} rows={2} />
      </div>
      {(isKind(p, "material") || sells.length > 0) && (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground">{t("items", { n: sells.length })}</p>
          {!sells.length ? (
            <p className="text-sm text-zinc-400">{t("itemsNone")}</p>
          ) : (
            <ul className="grid gap-1 text-sm text-zinc-300">
              {sells.map((x) => (
                <li key={x.id} className="flex justify-between gap-3">
                  <span>{x.name}</span>
                  <span className="font-mono text-zinc-100">{quoted(x) === null ? "—" : mxn(quoted(x)!)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <RecordHistory kind="providers" id={p.id} />
      <button
        type="button"
        onClick={() => window.confirm(t("confirmRemove", { name: providerName(p) || t("untitled") })) && deleteProvider(p.id)}
        className="h-10 w-fit rounded-full border border-red-400/30 px-4 text-sm text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("remove")}
      </button>
    </div>
  )
}
