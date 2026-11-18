"use client"

import { useId, useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { isKind, providerName } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { siteLabel, type Site } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { readState } from "@/lib/sync/state"
import {
  CONDITIONS,
  HOLDER_KINDS,
  TOOL_CATEGORIES,
  holderLabel,
  lastService,
  newServiceEntry,
  newTool,
  nextService,
  toolAlerts,
  toolLabel,
  toolValue,
  type Alert,
  type HolderKind,
  type ServiceEntry,
  type Tool,
  type ToolCategory,
} from "@/lib/tools/model"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { markFresh } from "@/lib/fresh"
import { deleteTool, saveTool, subscribeTools, toolsServerSnapshot, toolsSnapshot } from "@/lib/tools/store"

type T = ReturnType<typeof useTranslations>
const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const CARD = "grid gap-3 rounded-lg border border-white/10 p-3"
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// The open tool and the list's filters live in the URL (?h=<id>, ?q=…&cat=…&who=…&show=…), so the phone's back button
// walks back to the same filtered list.
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const readSearch = () => window.location.search
const go = (href: string) => {
  window.history.pushState(null, "", href === "?" ? window.location.pathname : `${window.location.pathname}${href}`)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo(0, 0)
}
/** The list's address with its filters, with a tool open (id) or not (null). */
function withTool(id: string | null) {
  const p = new URLSearchParams(window.location.search)
  if (id) p.set("h", id)
  else p.delete("h")
  const s = p.toString()
  return s ? `?${s}` : "?"
}

function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    go(href)
  }
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  )
}

/** Holder filter values: "" all, "k:<kind>" every one of a kind, "p:<name>" one person/vehicle/place, "s:<id>" a location. */
const holderKey = (x: Tool) => (x.holderKind === "despliegue" ? `s:${x.siteId}` : x.holderKind === "bodega" ? "k:bodega" : x.holder.trim() ? `p:${fold(x.holder.trim())}` : `k:${x.holderKind}`)
const matchesHolder = (x: Tool, who: string) => !who || holderKey(x) === who || (who.startsWith("k:") && x.holderKind === who.slice(2))

const toolList = () => toolsSnapshot().list

/** The tools: list with filters, and one page per tool. */
export function ToolsApp() {
  const t = useTranslations("herramientas")
  const store = useSyncExternalStore(subscribeTools, toolsSnapshot, toolsServerSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const search = useSyncExternalStore(subscribeUrl, readSearch, () => "")
  useDropUntouched(new URLSearchParams(search).get("h"), toolList, deleteTool)
  if (!store.loaded) return null
  const params = new URLSearchParams(search)
  const open = store.list.find((x) => x.id === params.get("h"))
  const today = localToday()
  if (open) return <ToolEditor t={t} x={open} sites={sites} all={store.list} today={today} />
  return <ToolList t={t} list={store.list} sites={sites} params={params} today={today} persisted={store.persisted} />
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-white/10 p-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="font-mono text-lg text-zinc-100">{value}</span>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  )
}

function alertText(t: T, a: Alert, x: Tool) {
  if (a === "service-overdue" || a === "service-soon") return t(`alerts.${a}`, { date: nextService(x) })
  if (a === "counter-limit" || a === "counter-near") return t(`alerts.${a}`, { label: x.counterLabel || t("maintenance.counter") })
  if (a === "condition") return t(`conditions.${x.condition}`)
  if (a === "warranty-soon") return t("alerts.warranty-soon", { date: x.warrantyEnd })
  return t(`alerts.${a}`)
}
const ALERT_TONE: Record<Alert, string> = {
  "service-overdue": "border-red-400/40 text-red-200",
  "counter-limit": "border-red-400/40 text-red-200",
  condition: "border-red-400/40 text-red-200",
  "service-soon": "border-amber-400/40 text-amber-200",
  "counter-near": "border-amber-400/40 text-amber-200",
  "service-unknown": "border-amber-400/40 text-amber-200",
  "warranty-soon": "border-amber-400/40 text-amber-200",
}
function Alerts({ t, x, list }: { t: T; x: Tool; list: Alert[] }) {
  if (!list.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((a) => (
        <span key={a} className={`rounded-full border px-2 py-0.5 text-xs ${ALERT_TONE[a]}`}>
          {alertText(t, a, x)}
        </span>
      ))}
    </span>
  )
}

const SHOWS = ["", "atencion", "fuera", "sin-cantidad"] as const

function ToolList({ t, list, sites, params, today, persisted }: { t: T; list: Tool[]; sites: Site[]; params: URLSearchParams; today: string; persisted: boolean }) {
  const q = params.get("q") ?? ""
  const cat = (TOOL_CATEGORIES as readonly string[]).includes(params.get("cat") ?? "") ? (params.get("cat") as ToolCategory) : ""
  const who = params.get("who") ?? ""
  const show = (SHOWS as readonly string[]).includes(params.get("show") ?? "") ? (params.get("show") as (typeof SHOWS)[number]) : ""
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(window.location.search)
    p.delete("h")
    if (v) p.set(k, v)
    else p.delete(k)
    const s = p.toString()
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  const siteName = (id: string) => {
    const s = sites.find((x) => x.id === id)
    return s ? siteLabel(s) : undefined
  }
  const kindLabel = (k: HolderKind) => t(`holder.kinds.${k}`)
  const where = (x: Tool) => holderLabel(x, siteName, kindLabel)

  // Holder filter: each kind, then each person, vehicle, place or location that has something.
  const holders = new Map<string, string>()
  for (const x of list) {
    const k = holderKey(x)
    if (k.startsWith("p:") || k.startsWith("s:")) holders.set(k, `${where(x)} (${kindLabel(x.holderKind)})`)
  }
  const needle = fold(q.trim())
  const shown = list
    .filter((x) => !cat || x.category === cat)
    .filter((x) => matchesHolder(x, who))
    .filter((x) => {
      if (show === "atencion") return x.quantity > 0 && toolAlerts(x, today).length > 0
      if (show === "fuera") return x.quantity > 0 && x.condition !== "bien"
      if (show === "sin-cantidad") return x.quantity === 0
      return true
    })
    .filter((x) => !needle || fold([x.name, x.brand, x.model, x.serial, x.holder, x.supplier, x.invoice, x.notes, where(x)].join(" ")).includes(needle))
    .sort((a, b) => TOOL_CATEGORIES.indexOf(a.category) - TOOL_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, "es"))

  const owned = list.filter((x) => x.quantity > 0)
  const pieces = owned.reduce((a, x) => a + x.quantity, 0)
  const values = owned.map(toolValue)
  const value = values.reduce<number>((a, v) => a + (v ?? 0), 0)
  const noPrice = values.filter((v) => v === null).length
  const attention = owned.filter((x) => toolAlerts(x, today).length > 0).length
  const out = owned.filter((x) => x.condition !== "bien").length

  const add = () => {
    const at = sites.find((s) => `s:${s.id}` === who)
    const holderKind: HolderKind = at ? "despliegue" : who.startsWith("k:") ? (who.slice(2) as HolderKind) : who.startsWith("p:") ? (list.find((x) => holderKey(x) === who)?.holderKind ?? "bodega") : "bodega"
    const holder = who.startsWith("p:") ? (list.find((x) => holderKey(x) === who)?.holder ?? "") : ""
    const x = newTool({ category: cat || "otros", holderKind, holder, siteId: at?.id ?? "" })
    saveTool(x)
    markFresh(x)
    go(withTool(x.id))
  }
  return (
    <div className="mt-6 grid gap-4">
      {!persisted && <p className="text-sm text-amber-200">{t("list.notSaved")}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t("list.tiles.pieces")} value={String(pieces)} hint={t("list.tiles.kinds", { n: owned.length })} />
        <Tile label={t("list.tiles.value")} value={mxn(value)} hint={noPrice ? t("list.tiles.noPrice", { n: noPrice }) : undefined} />
        <Tile label={t("list.tiles.attention")} value={String(attention)} />
        <Tile label={t("list.tiles.out")} value={String(out)} />
      </div>
      <button type="button" onClick={add} className={PRIMARY}>
        {t("list.add")}
      </button>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <TextField label={t("list.search")} value={q} onChange={(v) => setParam("q", v)} hint={t("list.searchHint")} />
        <PickField label={t("list.category")} value={cat} onChange={(v) => setParam("cat", v)} options={[{ value: "" as const, label: t("list.allCategories") }, ...TOOL_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]} />
        <PickField
          label={t("list.holder")}
          value={who}
          onChange={(v) => setParam("who", v)}
          options={[
            { value: "", label: t("list.allHolders") },
            ...HOLDER_KINDS.map((k) => ({ value: `k:${k}`, label: t(`list.everyKind.${k}`) })),
            ...[...holders].sort((a, b) => a[1].localeCompare(b[1], "es")).map(([value, label]) => ({ value, label })),
          ]}
        />
        <PickField label={t("list.show")} value={show} onChange={(v) => setParam("show", v)} options={SHOWS.map((s) => ({ value: s, label: t(`list.shows.${s || "all"}`) }))} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("list.count", { n: shown.length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("list.none")}</p>}
      <ul className="grid gap-2">
        {shown.map((x) => {
          const v = toolValue(x)
          return (
            <li key={x.id}>
              <NavLink href={withTool(x.id)} className="grid gap-1 rounded-xl border border-white/10 p-3 outline-none hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex items-start justify-between gap-3">
                  <span className={`text-sm ${x.quantity ? "text-zinc-100" : "text-zinc-400"}`}>{toolLabel(x)}</span>
                  <span className="shrink-0 font-mono text-xs text-zinc-300">{t("list.quantity", { n: x.quantity })}</span>
                </span>
                <span className="text-xs text-zinc-300">
                  {t(`categories.${x.category}`)} · {where(x)}
                  {x.serial ? ` · ${x.serial}` : ""}
                  {v !== null && x.quantity > 0 ? ` · ${mxn(v)}` : ""}
                </span>
                {x.quantity > 0 && <Alerts t={t} x={x} list={toolAlerts(x, today)} />}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A text input that suggests names already used (technicians, vehicles, places). */
function SuggestField({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: string[]; hint?: string }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-10 bg-white/[0.03] font-mono text-base md:text-sm"
      />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}

function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-white/15 p-4">
      <legend className="px-1 text-lg font-medium text-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}

function ToolEditor({ t, x, sites, all, today }: { t: T; x: Tool; sites: Site[]; all: Tool[]; today: string }) {
  const up = (p: Partial<Tool>) => saveTool({ ...x, ...p })
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list.filter((p) => !isKind(p, "carrier") || p.kinds.length > 1)
  const supplier = providers.find((p) => p.id === x.supplierId)
  const names = [...new Set(all.filter((y) => y.holderKind === x.holderKind && y.holder.trim()).map((y) => y.holder.trim()))].sort((a, b) => a.localeCompare(b, "es"))
  const site = sites.find((s) => s.id === x.siteId)
  const value = toolValue(x)
  const alerts = toolAlerts(x, today)
  const last = lastService(x)
  const next = nextService(x)
  const setS = (s: ServiceEntry) => up({ services: x.services.map((y) => (y.id === s.id ? s : y)) })
  const sortedServices = [...x.services].sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999"))
  return (
    <div className="mt-6 grid gap-5">
      <NavLink href={withTool(null)} className={SMALL}>
        {t("editor.back")}
      </NavLink>
      <div className="grid gap-2">
        <h2 className="text-2xl font-light text-foreground">{toolLabel(x)}</h2>
        <Alerts t={t} x={x} list={x.quantity > 0 ? alerts : []} />
        {x.quantity === 0 && <p className="text-sm text-zinc-400">{t("editor.zero")}</p>}
      </div>

      <Fieldset title={t("general.title")}>
        <div className={GRID}>
          <TextField label={t("general.name")} value={x.name} onChange={(v) => up({ name: v })} />
          <PickField label={t("general.category")} value={x.category} onChange={(category) => up({ category })} options={TOOL_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
          <TextField label={t("general.brand")} value={x.brand} onChange={(v) => up({ brand: v })} />
          <TextField label={t("general.model")} value={x.model} onChange={(v) => up({ model: v })} />
          <TextField label={t("general.serial")} value={x.serial} onChange={(v) => up({ serial: v.toUpperCase() })} hint={t("general.serialHint")} />
          <NumberField label={t("general.quantity")} unit={t("general.pieces")} integer max={100000} value={x.quantity} onChange={(v) => up({ quantity: v ?? 0 })} hint={t("general.quantityHint")} />
          <PickField label={t("general.condition")} value={x.condition} onChange={(condition) => up({ condition })} options={CONDITIONS.map((c) => ({ value: c, label: t(`conditions.${c}`) }))} />
        </div>
        <AreaField label={t("general.notes")} value={x.notes} onChange={(v) => up({ notes: v })} rows={2} />
      </Fieldset>

      <Fieldset title={t("holder.title")}>
        <div className={GRID}>
          <PickField
            label={t("holder.kind")}
            value={x.holderKind}
            onChange={(holderKind) => up({ holderKind, holder: holderKind === x.holderKind ? x.holder : "", siteId: holderKind === "despliegue" ? x.siteId : "" })}
            options={HOLDER_KINDS.map((k) => ({ value: k, label: t(`holder.kinds.${k}`) }))}
          />
          {x.holderKind === "despliegue" && (
            <PickField
              label={t("holder.site")}
              value={x.siteId}
              onChange={(siteId) => up({ siteId })}
              hint={sites.length ? undefined : t("holder.noSites")}
              options={[{ value: "", label: t("holder.unset") }, ...(x.siteId && !site ? [{ value: x.siteId, label: x.siteId.slice(0, 8) }] : []), ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: s.id, label: siteLabel(s) }))]}
            />
          )}
          {(x.holderKind === "tecnico" || x.holderKind === "vehiculo" || x.holderKind === "otro") && (
            <SuggestField label={t(`holder.name.${x.holderKind}`)} value={x.holder} onChange={(v) => up({ holder: v })} options={names} hint={t("holder.nameHint")} />
          )}
        </div>
        {x.holderKind === "despliegue" && site && (
          <a href={`/interno/admin/despliegues?d=${site.id}`} className="w-fit text-sm text-zinc-300 underline underline-offset-4 hover:text-foreground">
            {t("holder.openSite", { name: siteLabel(site) })}
          </a>
        )}
      </Fieldset>

      <Fieldset title={t("purchase.title")}>
        <div className={GRID}>
          <NumberField label={t("purchase.price")} unit="MXN" optional max={1e8} precision={2} value={x.price} onChange={(v) => up({ price: v })} hint={t("purchase.priceHint")} />
          <PickField
            label={t("purchase.supplierPick")}
            value={x.supplierId}
            onChange={(supplierId) => up({ supplierId })}
            hint={t("purchase.supplierHint")}
            options={[{ value: "", label: t("purchase.noSupplier") }, ...(x.supplierId && !supplier ? [{ value: x.supplierId, label: x.supplierId.slice(0, 8) }] : []), ...providers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 6) }))]}
          />
          {!supplier && <TextField label={t("purchase.supplier")} value={x.supplier} onChange={(v) => up({ supplier: v })} />}
          <DateField label={t("purchase.date")} value={x.purchaseDate} onChange={(v) => up({ purchaseDate: v })} />
          <DateField label={t("purchase.warranty")} value={x.warrantyEnd} onChange={(v) => up({ warrantyEnd: v })} />
          <TextField label={t("purchase.invoice")} value={x.invoice} onChange={(v) => up({ invoice: v })} />
        </div>
        {value !== null && x.quantity > 1 && <p className="text-sm text-zinc-100">{t("purchase.value", { value: mxn(value), n: x.quantity })}</p>}
        {x.warrantyEnd && <p className={`text-sm ${x.warrantyEnd < today ? "text-zinc-400" : "text-zinc-300"}`}>{x.warrantyEnd < today ? t("purchase.warrantyEnded") : t("purchase.warrantyUntil", { date: x.warrantyEnd })}</p>}
      </Fieldset>

      <Fieldset title={t("maintenance.title")}>
        <div className={GRID}>
          <NumberField label={t("maintenance.every")} unit={t("maintenance.months")} integer optional min={1} max={120} value={x.serviceMonths} onChange={(v) => up({ serviceMonths: v })} hint={t("maintenance.everyHint")} />
        </div>
        <p className="text-sm text-zinc-300">
          {t("maintenance.last", { date: last || "none" })}
          {x.serviceMonths ? ` · ${next ? t("maintenance.next", { date: next }) : t("maintenance.nextUnknown")}` : ""}
        </p>
        <div className={GRID}>
          <TextField label={t("maintenance.counterLabel")} value={x.counterLabel} onChange={(v) => up({ counterLabel: v })} hint={t("maintenance.counterLabelHint")} />
          {x.counterLabel.trim() && (
            <>
              <NumberField label={x.counterLabel} unit="#" integer optional max={1e9} value={x.counter} onChange={(v) => up({ counter: v })} />
              <NumberField label={t("maintenance.counterLimit")} unit="#" integer optional min={1} max={1e9} value={x.counterLimit} onChange={(v) => up({ counterLimit: v })} hint={t("maintenance.counterLimitHint")} />
            </>
          )}
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">{t("maintenance.log")}</h3>
          {!x.services.length && <p className="text-sm text-zinc-400">{t("maintenance.logNone")}</p>}
          {sortedServices.map((s) => (
            <div key={s.id} role="group" aria-label={`${t("maintenance.entry")} ${s.date || ""}`.trim()} className={CARD}>
              <div className={GRID}>
                <DateField label={t("maintenance.date")} value={s.date} onChange={(v) => setS({ ...s, date: v })} />
                <NumberField label={t("maintenance.cost")} unit="MXN" optional max={1e7} precision={2} value={s.cost} onChange={(v) => setS({ ...s, cost: v })} />
                <TextField label={t("maintenance.what")} value={s.what} onChange={(v) => setS({ ...s, what: v })} />
                <TextField label={t("maintenance.by")} value={s.by} onChange={(v) => setS({ ...s, by: v })} />
              </div>
              <button type="button" onClick={() => up({ services: x.services.filter((y) => y.id !== s.id) })} className={DANGER}>
                {t("maintenance.removeEntry")}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => up({ services: [...x.services, newServiceEntry({ date: today, by: readState().name })] })} className={SMALL}>
            {t("maintenance.addEntry")}
          </button>
        </div>
      </Fieldset>

      <button
        type="button"
        onClick={() => {
          if (!window.confirm(t("editor.confirmRemove", { name: toolLabel(x) }))) return
          deleteTool(x.id)
          go(withTool(null))
        }}
        className={DANGER}
      >
        {t("editor.remove")}
      </button>
    </div>
  )
}
