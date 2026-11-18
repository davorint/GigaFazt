"use client"

import { useEffect, useId, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { ClientPick, clientLine } from "@/components/clients/ClientPick"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { markFresh } from "@/lib/fresh"
import { clientLight } from "@/lib/clients/optics"
import { clientStatus, type Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { siteLabel, type Site } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { readState } from "@/lib/sync/state"
import {
  CAUSES,
  PRIORITIES,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  isOpen,
  newNote,
  newReport,
  relatedOpen,
  repeatClients,
  reportCode,
  reportStats,
  setStatus,
  type Report,
  type ReportStatus,
} from "@/lib/reports/model"
import { reportsStore } from "@/lib/reports/store"

type T = ReturnType<typeof useTranslations>
const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const STATUS_TONE: Record<ReportStatus, string> = {
  nuevo: "border-sky-400/40 text-sky-200",
  "en-proceso": "border-amber-400/40 text-amber-200",
  visita: "border-violet-400/40 text-violet-200",
  resuelto: "border-emerald-400/30 text-emerald-200",
  descartado: "border-white/15 text-zinc-400",
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// The open report lives in the URL (?r=<id>), so the phone's back button returns to the list.
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const readSearch = () => window.location.search
const go = (href: string, replace = false) => {
  const url = href === "?" ? window.location.pathname : `${window.location.pathname}${href}`
  if (replace) window.history.replaceState(null, "", url)
  else window.history.pushState(null, "", url)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo(0, 0)
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
const reportList = () => reportsStore.list()
const removeReport = (id: string) => reportsStore.remove(id)

/** "hace 3 h" / "hace 2 d". */
function ago(t: T, iso: string) {
  const h = (Date.now() - Date.parse(iso)) / 36e5
  if (!Number.isFinite(h)) return ""
  if (h < 1) return t("ago.minutes", { n: Math.max(1, Math.round(h * 60)) })
  if (h < 48) return t("ago.hours", { n: Math.round(h) })
  return t("ago.days", { n: Math.round(h / 24) })
}

/** Client problem reports: the list with filters and one page per report. */
export function ReportsApp() {
  const t = useTranslations("reportes")
  const store = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const search = useSyncExternalStore(subscribeUrl, readSearch, () => "")
  const params = new URLSearchParams(search)
  useDropUntouched(params.get("r"), reportList, removeReport)
  // /interno/admin/reportes_clientes?nuevo=<clientId> (from a client in Clientes) opens a new report for that client.
  const forClient = params.get("nuevo")
  useEffect(() => {
    if (!forClient || !store.loaded) return
    const c = clientsSnapshot().list.find((x) => x.id === forClient)
    const r = newReport({ clientId: c?.id ?? "", siteId: c?.siteId ?? "", by: readState().name })
    reportsStore.save(r)
    markFresh(r)
    go(`?r=${r.id}`, true)
  }, [forClient, store.loaded])
  if (!store.loaded) return null
  const open = store.list.find((r) => r.id === params.get("r"))
  if (open) return <ReportEditor t={t} r={open} all={store.list} clients={clients} sites={sites} />
  return <ReportList t={t} list={store.list} clients={clients} sites={sites} />
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-white/10 p-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="font-mono text-lg text-zinc-100">{value}</span>
    </div>
  )
}

function ReportList({ t, list, clients, sites }: { t: T; list: Report[]; clients: Client[]; sites: Site[] }) {
  const [show, setShow] = useState<"abiertos" | "todos" | ReportStatus>("abiertos")
  const [cat, setCat] = useState("")
  const [site, setSite] = useState("")
  const [who, setWho] = useState("")
  const [q, setQ] = useState("")
  const st = reportStats(list)
  const repeat = repeatClients(list)
  const clientOf = (id: string) => clients.find((c) => c.id === id)
  const assignees = [...new Set(list.map((r) => r.assignee.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))
  const needle = fold(q.trim())
  const rank = (p: string) => PRIORITIES.indexOf(p as (typeof PRIORITIES)[number])
  const shown = list
    .filter((r) => (show === "abiertos" ? isOpen(r) : show === "todos" ? true : r.status === show))
    .filter((r) => (!cat || r.category === cat) && (!site || r.siteId === site) && (!who || (who === "-" ? !r.assignee.trim() : r.assignee.trim() === who)))
    .filter((r) => {
      if (!needle) return true
      const c = clientOf(r.clientId)
      return fold([reportCode(r), r.name, r.phone, r.address, r.description, r.assignee, c ? clientLine(c) : "", c?.phone ?? ""].join(" ")).includes(needle)
    })
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || rank(a.priority) - rank(b.priority) || b.createdAt.localeCompare(a.createdAt))
  const add = () => {
    const r = newReport({ by: readState().name, siteId: site })
    reportsStore.save(r)
    markFresh(r)
    go(`?r=${r.id}`)
  }
  return (
    <div className="mt-6 grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={t("tiles.open")} value={String(st.open)} />
        <Tile label={t("tiles.urgent")} value={String(st.urgent)} />
        <Tile label={t("tiles.fresh")} value={st.web ? t("tiles.freshWeb", { n: st.fresh, web: st.web }) : String(st.fresh)} />
        <Tile label={t("tiles.solved30")} value={String(st.solved30)} />
        <Tile label={t("tiles.avg")} value={st.avgHours === null ? "—" : t("tiles.hours", { n: st.avgHours < 10 ? st.avgHours.toFixed(1) : Math.round(st.avgHours) })} />
      </div>
      {repeat.length > 0 && (
        <div role="note" className="grid gap-1 rounded-xl border border-amber-400/30 p-3">
          <p className="text-sm font-medium text-amber-200">{t("repeatTitle")}</p>
          {repeat.slice(0, 8).map((x) => {
            const c = clientOf(x.clientId)
            return (
              <p key={x.clientId} className="text-sm text-amber-100">
                {t("repeat", { client: c ? clientLine(c) : t("unknownClient"), n: x.n })}
              </p>
            )
          })}
        </div>
      )}
      <button type="button" onClick={add} className={PRIMARY}>
        {t("add")}
      </button>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <TextField label={t("search")} value={q} onChange={setQ} hint={t("searchHint")} />
        <PickField label={t("show")} value={show} onChange={setShow} options={[{ value: "abiertos" as const, label: t("shows.abiertos") }, { value: "todos" as const, label: t("shows.todos") }, ...REPORT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))]} />
        <PickField label={t("category")} value={cat} onChange={setCat} options={[{ value: "", label: t("allCategories") }, ...REPORT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]} />
        {sites.length > 0 && <PickField label={t("site")} value={site} onChange={setSite} options={[{ value: "", label: t("allSites") }, ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: s.id, label: siteLabel(s) }))]} />}
        <PickField label={t("assignee")} value={who} onChange={setWho} options={[{ value: "", label: t("allAssignees") }, { value: "-", label: t("noAssignee") }, ...assignees.map((a) => ({ value: a, label: a }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("count", { n: shown.length })}</p>
      {!list.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      {list.length > 0 && !shown.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      <ul className="grid gap-2">
        {shown.map((r) => {
          const c = clientOf(r.clientId)
          const s = sites.find((x) => x.id === r.siteId)
          return (
            <li key={r.id}>
              <NavLink href={`?r=${r.id}`} className="grid gap-1 rounded-xl border border-white/10 p-3 outline-none hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-zinc-100">{c ? clientLine(c) : r.name || t("noClient")}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{t(`statuses.${r.status}`)}</span>
                </span>
                <span className="text-xs text-zinc-300">
                  {t(`categories.${r.category}`)}
                  {s ? ` · ${siteLabel(s)}` : ""}
                  {r.assignee ? ` · ${r.assignee}` : ""}
                </span>
                <span className="flex flex-wrap gap-x-3 font-mono text-xs text-zinc-400">
                  <span>{reportCode(r)}</span>
                  <span>{ago(t, r.createdAt)}</span>
                  {r.priority !== "normal" && <span className={r.priority === "urgente" || r.priority === "alta" ? "text-red-300" : ""}>{t(`priorities.${r.priority}`)}</span>}
                  {r.source === "web" && <span className="text-sky-300">{t("web")}</span>}
                  {r.visitDate && isOpen(r) && <span>{t("visitOn", { date: r.visitDate })}</span>}
                </span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A text input that suggests names already used (who attends). */
function SuggestField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <Input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" className="h-10 bg-white/[0.03] font-mono text-base md:text-sm" />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
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

const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, "")
  return d.length === 10 ? `52${d}` : d
}

function ReportEditor({ t, r, all, clients, sites }: { t: T; r: Report; all: Report[]; clients: Client[]; sites: Site[] }) {
  const up = (p: Partial<Report>) => reportsStore.save({ ...r, ...p })
  const [note, setNote] = useState("")
  const client = clients.find((c) => c.id === r.clientId)
  const site = sites.find((s) => s.id === r.siteId)
  const me = readState().name
  const portOf = (clientId: string) => clients.find((c) => c.id === clientId)?.services.find((s) => s.type === "internet" && s.oltPort)?.oltPort ?? ""
  const related = relatedOpen(r, all, portOf)
  const history = r.clientId ? all.filter((x) => x.clientId === r.clientId && x.id !== r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []
  const assignees = [...new Set(all.map((x) => x.assignee.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))
  const phone = client?.whatsapp || client?.phone || r.phone
  const net = client?.services.filter((s) => s.type === "internet" && s.status !== "cancelado") ?? []
  const light = client ? clientLight(client) : null
  const label = (s: ReportStatus) => t(`statuses.${s}`)
  return (
    <div className="mt-6 grid gap-5">
      <NavLink href="?" className={SMALL}>
        {t("back")}
      </NavLink>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-light text-foreground">{reportCode(r)}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{label(r.status)}</span>
        {r.source === "web" && <span className="text-xs text-sky-300">{t("fromWeb")}</span>}
        <span className="text-xs text-zinc-400">{t("opened", { ago: ago(t, r.createdAt), by: r.by || "—" })}</span>
      </div>

      {related.length > 0 && (
        <div role="note" className="grid gap-1 rounded-xl border border-red-400/30 p-3">
          <p className="text-sm font-medium text-red-200">{t("related", { n: related.length, site: site ? siteLabel(site) : "" })}</p>
          {related.slice(0, 10).map((x) => {
            const c = clients.find((y) => y.id === x.clientId)
            return (
              <NavLink key={x.id} href={`?r=${x.id}`} className="text-sm text-red-100 underline underline-offset-4">
                {reportCode(x)} · {c ? clientLine(c) : x.name || t("noClient")} · {t(`categories.${x.category}`)}
              </NavLink>
            )
          })}
        </div>
      )}

      <Fieldset title={t("client.title")}>
        <ClientPick
          label={t("client.pick")}
          searchLabel={t("client.search")}
          searchHint={t("client.searchHint")}
          noneLabel={t("client.none")}
          value={r.clientId}
          siteId={r.siteId}
          onChange={(clientId) => up({ clientId, siteId: clients.find((c) => c.id === clientId)?.siteId || r.siteId })}
        />
        {(!client || r.source === "web") && (
          <div className={GRID}>
            <TextField label={t("client.name")} value={r.name} onChange={(v) => up({ name: v })} />
            <TextField label={t("client.phone")} value={r.phone} onChange={(v) => up({ phone: v })} />
            <TextField label={t("client.address")} value={r.address} onChange={(v) => up({ address: v })} />
          </div>
        )}
        {client && (
          <div className="grid gap-1 rounded-lg border border-white/10 p-3 text-sm">
            <p className="text-zinc-100">{clientLine(client)}</p>
            <p className="text-xs text-zinc-300">
              {t(`client.statuses.${clientStatus(client)}`)}
              {net.map((s) => [s.plan, s.pppoeUser, s.oltPort && `${t("client.port")} ${s.oltPort}${s.ontId !== null ? ` ONT ${s.ontId}` : ""}`].filter(Boolean).join(" · ")).map((x) => ` · ${x}`)}
            </p>
            {light && <p className={`text-xs ${light.status === "bien" ? "text-emerald-300" : "text-amber-200"}`}>{t("client.light", { rx: light.rx.toFixed(1), status: t(`client.lightStatus.${light.status}`) })}</p>}
            <a href={`/interno/admin/clientes?c=${client.id}`} className="w-fit text-xs text-zinc-300 underline underline-offset-4 hover:text-foreground">
              {t("client.open")}
            </a>
          </div>
        )}
        {phone && (
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${phone}`} className={SMALL}>
              {t("client.call", { phone })}
            </a>
            <a href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(t("client.waText", { code: reportCode(r) }))}`} target="_blank" rel="noopener noreferrer" className={SMALL}>
              {t("client.whatsapp")}
            </a>
          </div>
        )}
        {!client && (
          <PickField label={t("site")} value={r.siteId} onChange={(siteId) => up({ siteId })} options={[{ value: "", label: t("noSite") }, ...[...sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es")).map((s) => ({ value: s.id, label: siteLabel(s) }))]} />
        )}
      </Fieldset>

      <Fieldset title={t("problem.title")}>
        <div className={GRID}>
          <PickField label={t("category")} value={r.category} onChange={(category) => up({ category })} options={REPORT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
          <PickField label={t("priority")} value={r.priority} onChange={(priority) => up({ priority })} options={PRIORITIES.map((p) => ({ value: p, label: t(`priorities.${p}`) }))} />
        </div>
        <AreaField label={t("problem.description")} value={r.description} onChange={(v) => up({ description: v })} hint={t("problem.descriptionHint")} />
      </Fieldset>

      <Fieldset title={t("attention.title")}>
        <div className={GRID}>
          <PickField label={t("attention.status")} value={r.status} onChange={(s) => reportsStore.save(setStatus(r, s, me, label))} options={REPORT_STATUSES.map((s) => ({ value: s, label: label(s) }))} />
          <SuggestField label={t("assignee")} value={r.assignee} onChange={(v) => up({ assignee: v })} options={assignees} />
          <DateField label={t("attention.visit")} value={r.visitDate} onChange={(v) => up({ visitDate: v, status: v && r.status === "nuevo" ? "visita" : r.status })} />
        </div>
        <div className={GRID}>
          <PickField label={t("attention.cause")} value={r.cause} onChange={(cause) => up({ cause })} options={CAUSES.map((c) => ({ value: c, label: t(`causes.${c || "none"}`) }))} />
        </div>
        <AreaField label={t("attention.resolution")} value={r.resolution} onChange={(v) => up({ resolution: v })} hint={t("attention.resolutionHint")} rows={2} />
        {r.resolvedAt && <p className="text-xs text-zinc-400">{t("attention.closedAt", { date: new Date(r.resolvedAt).toLocaleString("es-MX") })}</p>}
      </Fieldset>

      <Fieldset title={t("notes.title")}>
        {!r.notes.length && <p className="text-sm text-zinc-400">{t("notes.none")}</p>}
        <ul className="grid gap-2">
          {[...r.notes].reverse().map((n) => (
            <li key={n.id} className="grid gap-0.5 rounded-lg border border-white/10 p-2 text-sm">
              <span className="text-xs text-zinc-400">
                {n.at ? new Date(n.at).toLocaleString("es-MX") : ""} · {n.by || "—"}
              </span>
              <span className="whitespace-pre-wrap text-zinc-100">{n.text}</span>
            </li>
          ))}
        </ul>
        <AreaField label={t("notes.new")} value={note} onChange={setNote} rows={2} />
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() => {
            up({ notes: [...r.notes, newNote(me, note.trim())] })
            setNote("")
          }}
          className={`${SMALL} disabled:opacity-50`}
        >
          {t("notes.add")}
        </button>
      </Fieldset>

      {history.length > 0 && (
        <section aria-labelledby="client-history" className="grid gap-2">
          <h3 id="client-history" className="text-sm font-medium text-foreground">
            {t("history", { n: history.length })}
          </h3>
          {history.slice(0, 20).map((x) => (
            <NavLink key={x.id} href={`?r=${x.id}`} className="text-sm text-zinc-300 underline underline-offset-4">
              {reportCode(x)} · {x.createdAt.slice(0, 10)} · {t(`categories.${x.category}`)} · {label(x.status)}
              {x.cause ? ` · ${t(`causes.${x.cause}`)}` : ""}
            </NavLink>
          ))}
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          if (!window.confirm(t("confirmRemove", { code: reportCode(r) }))) return
          reportsStore.remove(r.id)
          go("?")
        }}
        className={DANGER}
      >
        {t("remove")}
      </button>
    </div>
  )
}
