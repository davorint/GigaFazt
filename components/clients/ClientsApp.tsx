"use client"

import { clientPlace } from "@/lib/clients/place"
import { useMemo, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { localToday } from "@/lib/clients/from-lead"
import { clientsCsv, IMPORT_FIELDS, type ImportField } from "@/lib/clients/import"
import {
  CLIENT_KINDS,
  PAY_METHODS,
  SERVICE_STATUSES,
  CANCEL_REASONS,
  SERVICE_TYPES,
  clientLabel,
  clientStatus,
  monthlyTotal,
  newClient,
  newContact,
  newService,
  onOurFiber,
  pppoeUsers,
  setPrice,
  possibleDuplicates,
  withReading,
  lightDrop,
  type Client,
  type ClientKind,
  type ClientStatus,
  type Contact,
  type Service,
} from "@/lib/clients/model"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { clientLight, lightStatus, type LightStatus } from "@/lib/clients/optics"
import { clientsServerSnapshot, clientsSnapshot, deleteClient, saveClient, subscribeClients } from "@/lib/clients/store"
import { siteLabel, towerLabel } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { mxn } from "@/lib/materials/catalog"
import { ImportPanel } from "./ImportPanel"
import { LeadsPanel } from "./LeadsPanel"
import { ClientBilling, PaymentsPanel } from "./PaymentsPanel"
import { ClientHistory } from "./ClientHistory"

type T = ReturnType<typeof useTranslations>
const TABS = ["clients", "payments", "leads", "import"] as const
type Tab = (typeof TABS)[number]
const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const TONE: Record<ClientStatus, string> = {
  activo: "border-emerald-400/40 text-emerald-300",
  suspendido: "border-amber-400/40 text-amber-200",
  cancelado: "border-white/15 text-zinc-400",
  "sin-servicio": "border-white/15 text-zinc-400",
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const clientList = () => clientsSnapshot().list

const subscribeTabUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}

/** Clients, payments, website requests and the import, as four tabs of /interno/admin/clientes. */
export function ClientsApp() {
  const t = useTranslations("clientes")
  // The tab is in the URL (?tab=payments, also the link from the "today" screen on /interno).
  const search = useSyncExternalStore(subscribeTabUrl, () => window.location.search, () => "")
  const raw = new URLSearchParams(search).get("tab") ?? ""
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "clients"
  const setTab = (k: Tab) => {
    const p = new URLSearchParams(window.location.search)
    if (k === "clients") p.delete("tab")
    else p.set("tab", k)
    window.history.replaceState(window.history.state, "", p.toString() ? `?${p}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  // The open client is in the URL (?c=<id>, also the links from Despliegues), so the back button closes it.
  const [openId, setOpenId] = useOpenParam("c")
  useDropUntouched(openId, clientList, deleteClient)
  const show = (id: string) => {
    setTab("clients")
    setOpenId(id)
  }
  return (
    <div className="mt-6 grid gap-5">
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className="h-10 flex-1 rounded-lg px-4 text-sm text-zinc-400 aria-selected:bg-white/10 aria-selected:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
        {tab === "clients" && <ClientList t={t} openId={openId} setOpenId={setOpenId} />}
        {tab === "payments" && <PaymentsPanel onClient={show} />}
        {tab === "leads" && <LeadsPanel onClient={show} />}
        {tab === "import" && <ImportPanel />}
      </div>
    </div>
  )
}

function ClientList({ t, openId, setOpenId }: { t: T; openId: string | null; setOpenId: (id: string | null) => void }) {
  const store = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const [q, setQ] = useState("")
  const [kind, setKind] = useState<ClientKind | "">("")
  const [status, setStatus] = useState<ClientStatus | "">("")
  const [light, setLight] = useState<"" | "mala" | "sin">("")
  const [building, setBuilding] = useState("")
  const [site, setSite] = useState("")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const list = store.list
  const buildings = useMemo(() => [...new Set(list.map((c) => c.building.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [list])
  if (!store.loaded) return null
  const needle = fold(q.trim())
  const shown = list
    .filter((c) => (!kind || c.kind === kind) && (!status || clientStatus(c) === status) && matchesLight(c, light) && (!building || c.building.trim() === building) && (!site || (site === "-" ? !sites.some((x) => x.id === c.siteId) : c.siteId === site)))
    .filter(
      (c) =>
        !needle ||
        fold(
          [c.name, c.phone, c.whatsapp, c.email, c.building, c.tower, c.apartment, ...c.contacts.flatMap((x) => [x.name, x.phone, x.email]), ...c.services.flatMap((s) => [s.plan, s.pppoeUser, s.ontSn])].join(" ")
        ).includes(needle)
    )
    .sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "es"))
  const add = (v: Record<string, string>) => {
    const at = sites.find((x) => x.id === v.site)
    const k = (CLIENT_KINDS as readonly string[]).includes(v.kind) ? (v.kind as ClientKind) : "residencial"
    const c = newClient({ name: v.name, phone: v.phone, kind: k, building: building || (at ? siteLabel(at) : ""), siteId: at?.id ?? "" })
    saveClient(c)
    setOpenId(c.id)
    setQ("")
    setStatus("")
  }
  const headers = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, t(`fields.${f}`)])) as Record<ImportField, string>
  const labels = {
    kind: Object.fromEntries(CLIENT_KINDS.map((k) => [k, t(`kinds.${k}`)])) as Record<ClientKind, string>,
    status: Object.fromEntries([...SERVICE_STATUSES, "sin-servicio"].map((s) => [s, t(`statuses.${s}`)])),
  }
  const byKind = Object.fromEntries(CLIENT_KINDS.map((k) => [k, list.filter((c) => c.kind === k).length])) as Record<ClientKind, number>
  return (
    <div className="grid gap-4">
      <QuickAdd
        title={t("list.add")}
        submit={t("list.addSubmit")}
        initial={{ kind: kind || "residencial", site: site && site !== "-" ? site : "" }}
        fields={[
          { key: "name", label: t("fields.name"), required: true },
          { key: "phone", label: t("fields.phone"), kind: "tel" },
          { key: "kind", label: t("fields.kind"), kind: "select", options: CLIENT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })) },
          { key: "site", label: t("site.label"), kind: "select", options: [{ value: "", label: "—" }, ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: s.id, label: siteLabel(s) }))] },
        ]}
        onAdd={add}
      />
      <div className="flex flex-wrap gap-2">
        {list.length > 0 && (
          <button type="button" onClick={() => download(`clientes-${localToday()}.csv`, clientsCsv(shown, headers, labels), "text/csv;charset=utf-8")} className={BTN}>
            {t("list.exportCsv")}
          </button>
        )}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label={t("list.search")} value={q} onChange={setQ} hint={t("list.searchHint")} />
        <PickField label={t("list.kind")} value={kind} onChange={setKind} options={[{ value: "" as const, label: t("list.allKinds") }, ...CLIENT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))]} />
        <PickField
          label={t("list.status")}
          value={status}
          onChange={setStatus}
          options={[{ value: "" as const, label: t("list.allStatuses") }, ...([...SERVICE_STATUSES, "sin-servicio"] as const).map((s) => ({ value: s, label: t(`statuses.${s}`) }))]}
        />
        {sites.length > 0 && (
          <PickField
            label={t("list.site")}
            value={site}
            onChange={setSite}
            options={[{ value: "", label: t("list.allSites") }, { value: "-", label: t("site.unset") }, ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((x) => ({ value: x.id, label: siteLabel(x) }))]}
          />
        )}
        <PickField label={t("light.filter")} value={light} onChange={setLight} options={[{ value: "" as const, label: t("light.all") }, { value: "mala" as const, label: t("light.bad") }, { value: "sin" as const, label: t("light.none") }]} />
        <PickField label={t("list.building")} value={building} onChange={setBuilding} options={[{ value: "", label: t("list.allBuildings") }, ...buildings.map((b) => ({ value: b, label: b }))]} />
      </div>
      <div className="grid gap-0.5 font-mono text-xs text-zinc-400">
        <p>{t("list.count", { shown: shown.length, n: list.length, active: list.filter((c) => clientStatus(c) === "activo").length })}</p>
        {list.length > 0 && <p>{t("list.byKind", byKind)}</p>}
      </div>
      {!shown.length && <p className="text-sm text-zinc-400">{t("list.empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((c) => (
          <li key={c.id}>
            <Row t={t} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

const LIGHT_TONE: Record<LightStatus, string> = {
  bien: "border-emerald-400/30 text-emerald-200",
  justo: "border-amber-400/40 text-amber-200",
  baja: "border-red-400/40 text-red-200",
  satura: "border-red-400/40 text-red-200",
}
/** Light filter: "mala" = low, at the limit or saturating; "sin" = an active internet service without a reading. */
function matchesLight(c: Client, f: "" | "mala" | "sin") {
  if (!f) return true
  const l = clientLight(c)
  if (f === "mala") return !!l && l.status !== "bien"
  return c.services.some((s) => s.type === "internet" && s.status !== "cancelado" && s.rxDbm === null)
}

function Row({ t, c, open, onToggle }: { t: T; c: Client; open: boolean; onToggle: () => void }) {
  const where = clientPlace(c, useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list)
  const status = clientStatus(c)
  const light = clientLight(c)
  const services = c.services.filter((s) => s.status !== "cancelado").map((s) => (s.type === "internet" && s.plan ? `${t("services.types.internet")} ${s.plan}` : t(`services.types.${s.type}`)))
  const sub = [where, services.join(" + ") || t("list.noServices"), c.name ? pppoeUsers(c)[0] : ""].filter(Boolean).join(" · ")
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm text-zinc-100">{c.name || pppoeUsers(c)[0] || t("list.untitled")}</span>
          <span className="truncate font-mono text-xs text-zinc-400">{sub}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[status]}`}>{t(`statuses.${status}`)}</span>
          {light && light.status !== "bien" && <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${LIGHT_TONE[light.status]}`}>{t("light.chip", { rx: light.rx.toFixed(1) })}</span>}
          <span className="text-xs text-zinc-400">{t(`kinds.${c.kind}`)}</span>
        </span>
      </button>
      {open && <Editor t={t} c={c} />}
    </div>
  )
}

/** The client's deployment location and tower, from /interno/admin/despliegues. */
function SitePick({ t, c, up }: { t: T; c: Client; up: (p: Partial<Client>) => void }) {
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const site = sites.find((x) => x.id === c.siteId)
  const sorted = [...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"))
  return (
    <>
      <PickField
        label={t("site.label")}
        value={c.siteId}
        hint={sites.length ? t("site.hint") : t("site.none")}
        onChange={(siteId) => {
          const next = sites.find((x) => x.id === siteId)
          // Choosing a location fills the building when it's still empty; the tower is cleared (it belonged to the other one).
          up({ siteId, towerId: "", building: c.building || (next ? siteLabel(next) : "") })
        }}
        options={[
          { value: "", label: t("site.unset") },
          ...(c.siteId && !site ? [{ value: c.siteId, label: c.siteId.slice(0, 8) }] : []),
          ...sorted.map((x) => ({ value: x.id, label: siteLabel(x) })),
        ]}
      />
      {site && site.towers.length > 0 && (
        <PickField
          label={t("site.tower")}
          value={c.towerId}
          onChange={(towerId) => {
            const tw = site.towers.find((x) => x.id === towerId)
            up({ towerId, tower: c.tower || (tw ? towerLabel(tw, site.towers.indexOf(tw)) : "") })
          }}
          options={[{ value: "", label: t("site.unset") }, ...site.towers.map((x, i) => ({ value: x.id, label: towerLabel(x, i) }))]}
        />
      )}
    </>
  )
}

/** A warning when another client has the same phone or PPPoE user (to avoid two records for one person). */
function Duplicates({ t, c }: { t: T; c: Client }) {
  const all = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const dups = possibleDuplicates(c, all)
  if (!dups.length) return null
  return (
    <div role="note" className="grid gap-1 rounded-lg border border-amber-400/30 p-3">
      {dups.map(({ client, why }) => (
        <p key={client.id} className="text-sm text-amber-100">
          {t(`dup.${why}`, { name: clientLabel(client) })}{" "}
          <a href={`?c=${client.id}`} className="underline underline-offset-4">
            {t("dup.open")}
          </a>
        </p>
      ))}
    </div>
  )
}

function Editor({ t, c }: { t: T; c: Client }) {
  const up = (p: Partial<Client>) => saveClient({ ...c, ...p })
  const text = (f: "phone" | "whatsapp" | "email" | "tower" | "apartment") => (
    <TextField label={t(`fields.${f}`)} value={c[f]} onChange={(v) => up({ [f]: v })} type={f === "phone" || f === "whatsapp" ? "tel" : f === "email" ? "email" : "text"} />
  )
  const setService = (s: Service) => up({ services: c.services.map((x) => (x.id === s.id ? s : x)) })
  const setContact = (k: Contact) => up({ contacts: c.contacts.map((x) => (x.id === k.id ? k : x)) })
  const business = c.kind === "empresa" || c.kind === "administracion"
  const active = c.services.filter((s) => s.status === "activo")
  const missing = active.filter((s) => s.monthly === null).length
  return (
    <div className="grid gap-6 border-t border-white/10 p-3">
      {c.leadId && <p className="text-xs text-cyan-200">{t("list.fromLead")}</p>}
      <Duplicates t={t} c={c} />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.contact")}</legend>
        <div className={GRID}>
          <PickField label={t("fields.kind")} value={c.kind} onChange={(kind) => up({ kind })} options={CLIENT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} hint={t(`kindHints.${c.kind}`)} />
          <TextField label={t(`nameByKind.${c.kind}`)} value={c.name} onChange={(v) => up({ name: v })} />
          {text("phone")}
          {text("whatsapp")}
          {text("email")}
          <SitePick t={t} c={c} up={up} />
          <TextField label={t(`buildingByKind.${c.kind}`)} value={c.building} onChange={(v) => up({ building: v })} />
          {text("tower")}
          {c.kind !== "administracion" && text("apartment")}
        </div>
      </fieldset>

      {(business || c.contacts.length > 0) && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium text-foreground">{t("contacts.title")}</legend>
          <p className="text-xs text-zinc-400">{t("contacts.hint")}</p>
          {!c.contacts.length && <p className="text-sm text-zinc-400">{t("contacts.none")}</p>}
          {c.contacts.map((k, i) => (
            <div key={k.id} role="group" aria-label={`${t("contacts.title")} ${i + 1}`} className="grid gap-3 rounded-lg border border-white/10 p-3">
              <div className={GRID}>
                <TextField label={t("contacts.name")} value={k.name} onChange={(v) => setContact({ ...k, name: v })} />
                <TextField label={t("contacts.role")} value={k.role} onChange={(v) => setContact({ ...k, role: v })} />
                <TextField label={t("contacts.phone")} value={k.phone} onChange={(v) => setContact({ ...k, phone: v })} type="tel" />
                <TextField label={t("contacts.email")} value={k.email} onChange={(v) => setContact({ ...k, email: v })} type="email" />
              </div>
              <button type="button" onClick={() => up({ contacts: c.contacts.filter((x) => x.id !== k.id) })} className={DANGER}>
                {t("contacts.remove")}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => up({ contacts: [...c.contacts, newContact()] })} className={`${SMALL} w-fit`}>
            {t("contacts.add")}
          </button>
        </fieldset>
      )}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("services.title")}</legend>
        {!c.services.length && <p className="text-sm text-zinc-400">{t("services.none")}</p>}
        {c.services.map((s, i) => (
          <ServiceCard key={s.id} t={t} c={c} s={s} n={i + 1} onChange={setService} onRemove={() => window.confirm(t("services.confirmRemove", { name: clientLabel(c) })) && up({ services: c.services.filter((x) => x.id !== s.id) })} />
        ))}
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => up({ services: [...c.services, newService(type, { start: localToday() })] })} className={SMALL}>
              {t(`services.add.${type}`)}
            </button>
          ))}
        </div>
        {active.length > 0 && (
          <p className="text-sm text-zinc-100">
            {t("services.total", { total: mxn(monthlyTotal(c)) })}
            {missing > 0 && <span className="text-amber-200"> · {t("services.totalMissing", { n: missing })}</span>}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.billing")}</legend>
        <div className={GRID}>
          <PickField label={t("fields.payMethod")} value={c.payMethod} onChange={(payMethod) => up({ payMethod })} options={PAY_METHODS.map((m) => ({ value: m, label: t(`methods.${m || "none"}`) }))} />
        </div>
        <ClientBilling t={t} c={c} onChange={up} />
        <AreaField label={t("fields.notes")} value={c.notes} onChange={(v) => up({ notes: v })} />
      </fieldset>
      <ClientHistory c={c} />
      <a href={`/interno/admin/reportes_clientes?nuevo=${c.id}`} className="inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {t("list.newReport")}
      </a>
      <RecordHistory kind="clients" id={c.id} />
      <button type="button" onClick={() => window.confirm(t("list.confirmRemove", { name: clientLabel(c) })) && deleteClient(c.id)} className={DANGER}>
        {t("list.remove")}
      </button>
    </div>
  )
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`
}

/** Earlier light readings of a service and how much it has lost since the first one. */
function LightHistory({ t, s }: { t: T; s: Service }) {
  if (!s.rxHistory.length) return null
  const drop = lightDrop(s)
  return (
    <div className="grid content-start gap-1 sm:col-span-2">
      <p className="font-mono text-xs text-zinc-300">{t("light.history")}</p>
      <p className="font-mono text-xs text-zinc-400">{[...s.rxHistory].reverse().slice(0, 8).map((h) => `${h.date}: ${h.rx.toFixed(1)}`).join(" · ")}</p>
      {drop !== null && drop >= 2 && <p className="text-xs text-amber-200">{t("light.dropping", { db: drop.toFixed(1), since: s.rxHistory[0].date })}</p>}
    </div>
  )
}

function ServiceCard({ t, c, s, n, onChange, onRemove }: { t: T; c: Client; s: Service; n: number; onChange: (s: Service) => void; onRemove: () => void }) {
  const up = (p: Partial<Service>) => onChange({ ...s, ...p })
  const net = s.type === "internet"
  const field = (f: "ontModel" | "pppoeUser" | "deployment" | "oltPort") => (
    <TextField label={t(`fields.${f}`)} value={s[f]} onChange={(v) => up({ [f]: v })} />
  )
  return (
    <div role="group" aria-label={`${t(`services.types.${s.type}`)} ${n}`} className="grid gap-3 rounded-lg border border-white/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-100">{t(`services.types.${s.type}`)}</p>
        {s.type === "iptv" && <p className="text-xs text-zinc-400">{onOurFiber(c) ? t("services.fiberOurs") : t("services.fiberOther")}</p>}
      </div>
      <div className={GRID}>
        <PickField
          label={t("services.status")}
          value={s.status}
          onChange={(status) => up(status === "cancelado" ? { status, cancelledAt: s.cancelledAt || localToday(), hold: false } : { status, cancelledAt: "", cancelReason: "", cancelNote: "", hold: status === "suspendido" ? s.hold : false })}
          options={SERVICE_STATUSES.map((x) => ({ value: x, label: t(`statuses.${x}`) }))}
        />
        {s.type === "internet" && s.status === "suspendido" && (
          <label className="flex min-h-10 items-center gap-2 self-end text-sm text-zinc-200">
            <input type="checkbox" checked={s.hold} onChange={(e) => up({ hold: e.target.checked })} className="size-5 accent-white" />
            <span>
              {t("services.hold")} <span className="block text-xs text-zinc-400">{t("services.holdHint")}</span>
            </span>
          </label>
        )}
        {s.status === "cancelado" && (
          <div className="grid gap-1">
            <DateField label={t("services.cancelledAt")} value={s.cancelledAt} onChange={(v) => up({ cancelledAt: v })} />
            <p className="text-xs text-zinc-400">{t("services.cancelledAtHint")}</p>
          </div>
        )}
        {s.status === "cancelado" && (
          <PickField
            label={t("services.cancelReason")}
            value={s.cancelReason}
            onChange={(cancelReason) => up({ cancelReason })}
            options={CANCEL_REASONS.map((x) => ({ value: x, label: t(`services.cancelReasons.${x || "none"}`) }))}
          />
        )}
        {s.status === "cancelado" && <TextField label={t("services.cancelNote")} value={s.cancelNote} onChange={(v) => up({ cancelNote: v })} hint={t("services.cancelNoteHint")} />}
        <TextField label={t(`services.plan.${s.type}`)} value={s.plan} onChange={(v) => up({ plan: v })} hint={t(`services.planHint.${s.type}`)} />
        <DateField label={t("services.start")} value={s.start} onChange={(v) => up({ start: v })} />
        <div className="grid gap-1">
          <NumberField label={t("services.monthly")} unit={t("list.perMonth")} optional max={1e7} value={s.monthly} onChange={(v) => onChange(setPrice(s, v, localToday().slice(0, 7)))} hint={s.monthly !== null ? mxn(s.monthly) : undefined} />
          {s.priceHistory.length > 0 && (
            <ul className="grid gap-0.5 text-xs text-zinc-400">
              {s.priceHistory.map((p) => (
                <li key={p.until}>{t("services.priceUntil", { price: p.monthly === null ? "—" : mxn(p.monthly), month: p.until })}</li>
              ))}
              <li>{t("services.priceFrom", { month: nextMonth(s.priceHistory[s.priceHistory.length - 1].until) })}</li>
            </ul>
          )}
        </div>
        {net && (
          <>
            {field("ontModel")}
            <TextField label={t("fields.ontSn")} value={s.ontSn} onChange={(v) => up({ ontSn: v.toUpperCase().slice(0, 40) })} />
            {field("pppoeUser")}
            {field("deployment")}
            {field("oltPort")}
            <NumberField label={t("fields.ontId")} unit="#" integer optional max={255} value={s.ontId} onChange={(v) => up({ ontId: v })} />
            <NumberField label={t("light.rx")} unit="dBm" optional min={-60} max={15} precision={2} value={s.rxDbm} onChange={(v) => onChange(withReading(s, v, s.oltRxDbm, localToday()))} hint={s.rxDbm !== null ? t(`light.status.${lightStatus(s.rxDbm)}`) + (s.rxDate ? ` · ${t("light.readOn", { date: s.rxDate })}` : "") : t("light.rxHint")} />
            <NumberField label={t("light.oltRx")} unit="dBm" optional min={-60} max={15} precision={2} value={s.oltRxDbm} onChange={(v) => up({ oltRxDbm: v })} />
            <LightHistory t={t} s={s} />
          </>
        )}
      </div>
      <AreaField label={t("services.notes")} value={s.notes} onChange={(v) => up({ notes: v })} rows={2} />
      <button type="button" onClick={onRemove} className={DANGER}>
        {t("services.remove")}
      </button>
    </div>
  )
}
