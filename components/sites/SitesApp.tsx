"use client"

import { SECTIONS as SURVEY_SECTIONS, completeness, type Survey } from "@/lib/survey/model"
import { subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { PlaceFields } from "@/components/interno/PlaceFields"
import { useEffect, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { clientLabel, clientStatus, type Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { isKind, providerName, type Provider } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { EQUIPMENT_KINDS, POWER_PAYERS, newEquipment, newPort, newRoom, newRoomCarrier, newSite, newSiteContact, newTower, removeRoom, removeTower, roomCapacity, roomLabel, siteCost, linksCost, siteProfit, unpricedLinks, siteLabel, towerLabel, type Equipment, type PonPort, type Room, type RoomCarrier, type Site, type SiteContact, type Tower, agreementStatus, RENEWALS, DEFAULT_NOTICE_DAYS } from "@/lib/sites/model"
import { portClients, siteStats, type SiteStats } from "@/lib/sites/stats"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { notesStore } from "@/lib/notes/store"
import { toolLabel } from "@/lib/tools/model"
import { subscribeTools, toolsServerSnapshot, toolsSnapshot } from "@/lib/tools/store"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { ExportButton } from "@/components/interno/ExportButton"
import { toCsv } from "@/lib/csv"
import { deleteSite, saveSite, sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { catalogSnapshot } from "@/lib/materials/store"
import { placesStockItems, sitePlace } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"

type T = ReturnType<typeof useTranslations>
const SECTIONS = ["general", "torres", "cuartos", "acceso", "acuerdo", "clientes", "levantamiento"] as const
type Section = (typeof SECTIONS)[number]
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const CARD = "grid gap-3 rounded-lg border border-white/10 p-3"
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// The open location and section live in the URL (?d=<id>&s=<section>), so the phone's back button walks back.
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
function NavLink({ href, className, current, children }: { href: string; className: string; current?: boolean; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    go(href)
  }
  return (
    <a href={href} onClick={onClick} aria-current={current ? "page" : undefined} className={className}>
      {children}
    </a>
  )
}

const siteList = () => sitesSnapshot().list

/** The deployment locations: list, and each location's sections as pages. */
export function SitesApp() {
  const t = useTranslations("despliegues")
  const store = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const search = useSyncExternalStore(subscribeUrl, readSearch, () => "")
  const surveys = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot)
  useDropUntouched(new URLSearchParams(search).get("d"), siteList, deleteSite)
  if (!store.loaded || !surveys.loaded) return null
  const params = new URLSearchParams(search)
  const open = store.list.find((s) => s.id === params.get("d"))
  const section = (SECTIONS as readonly string[]).includes(params.get("s") ?? "") ? (params.get("s") as Section) : "general"
  if (open) return <SiteEditor t={t} s={open} section={section} clients={clients} survey={surveys.list.find((x) => x.siteId === open.id)} />
  return <SiteList t={t} list={store.list} clients={clients} surveys={surveys.list.filter((x) => !x.siteId || !store.list.some((s) => s.id === x.siteId))} />
}

const SURVEYS = "/interno/levantamientos"

/**
 * Surveys still being captured (owner, 2026-11-20: one section; a survey becomes a deployment once captured), newest
 * first, with how much is filled. A survey whose deployment was deleted shows here again.
 */
function SurveysInProgress({ t, list, needle }: { t: T; list: Survey[]; needle: string }) {
  const shown = list
    .filter((x) => !needle || fold([x.ident.name, x.ident.address, x.ident.municipality, x.ident.state].join(" ")).includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <section aria-labelledby="levantamientos-curso" className="grid gap-2 rounded-xl border border-white/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="levantamientos-curso" className="text-base font-medium text-foreground">
          {t("survey.title", { n: shown.length })}
        </h2>
        {/* Created on the survey page (?nuevo=1), which also removes it if left blank. */}
        <a href={`${SURVEYS}?nuevo=1`} className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {t("survey.new")}
        </a>
      </div>
      <p className="text-xs text-zinc-400">{t("survey.hint")}</p>
      {shown.length > 0 && (
        <ul className="grid gap-2">
          {shown.map((x) => {
            const filled = SURVEY_SECTIONS.reduce((a, k) => {
              const c = completeness(x, k)
              return { done: a.done + c.done, total: a.total + c.total }
            }, { done: 0, total: 0 })
            return (
              <li key={x.id}>
                <a href={`${SURVEYS}?l=${x.id}`} className="grid gap-1 rounded-lg border border-white/10 p-3 hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm text-zinc-100">{x.ident.name || t("list.untitled")}</span>
                    <span className="shrink-0 rounded-full border border-cyan-300/40 px-2 py-0.5 font-mono text-[0.7rem] text-cyan-100">{t("survey.badge")}</span>
                  </span>
                  <span className="text-xs text-zinc-400">
                    {[x.ident.address, x.ident.municipality, x.ident.visitDate && t("survey.visit", { date: x.ident.visitDate }), filled.total ? t("survey.filled", { pct: Math.round((filled.done / filled.total) * 100) }) : ""].filter(Boolean).join(" · ")}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
      <a href={SURVEYS} className="w-fit text-xs text-zinc-400 underline decoration-white/30 underline-offset-4 hover:text-zinc-200">
        {t("survey.files")}
      </a>
    </section>
  )
}

/** The survey this deployment came from: its date and who did it, and its pages (the sections and the proposal). */
function SurveyTab({ t, survey }: { t: T; survey: Survey | undefined }) {
  if (!survey) return <p className="text-sm text-zinc-400">{t("survey.noneLinked")}</p>
  return (
    <div className="grid gap-3">
      <p className="text-sm text-zinc-300">{t("survey.linked", { date: survey.ident.visitDate || "—", who: survey.ident.surveyors || "—" })}</p>
      <div className="flex flex-wrap gap-2">
        <a href={`${SURVEYS}?l=${survey.id}`} className={SMALL}>
          {t("survey.open")}
        </a>
        <a href={`${SURVEYS}/propuesta?l=${survey.id}`} className={SMALL}>
          {t("survey.proposal")}
        </a>
      </div>
      <p className="text-xs text-zinc-400">{t("survey.linkedHint")}</p>
    </div>
  )
}

function SiteList({ t, list, clients, surveys }: { t: T; list: Site[]; clients: Client[]; surveys: Survey[] }) {
  const search = useSyncExternalStore(subscribeUrl, readSearch, () => "")
  const q = new URLSearchParams(search).get("q") ?? ""
  const setQ = (v: string) => {
    window.history.replaceState(null, "", v ? `?q=${encodeURIComponent(v)}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  const needle = fold(q.trim())
  const shown = list
    .filter(
      (s) =>
        !needle ||
        fold([s.name, s.address, s.municipality, s.state, ...s.rooms.flatMap((r) => [...r.equipment.flatMap((e) => [e.model, e.serial, e.ip]), ...r.carriers.flatMap((c) => [c.name, c.ip, c.account])])].join(" ")).includes(needle)
    )
    .sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"))
  const add = (v: Record<string, string>) => {
    const s = newSite({ name: v.name, address: v.address })
    saveSite(s)
    go(`?d=${s.id}`)
  }
  return (
    <div className="mt-6 grid gap-4">
      <SurveysInProgress t={t} list={surveys} needle={needle} />
      <QuickAdd
        title={t("list.add")}
        submit={t("list.addSubmit")}
        fields={[
          { key: "name", label: t("general.name"), required: true, placeholder: t("list.addNamePlaceholder") },
          { key: "address", label: t("general.address") },
        ]}
        onAdd={add}
      />
      <ExportButton
        label={t("list.exportCsv")}
        name="despliegues"
        disabled={!list.length}
        build={() =>
          toCsv(
            [t("general.name"), t("general.address"), t("general.municipality"), t("general.state"), t("general.tiles.towers"), t("general.tiles.apartments"), t("general.tiles.rooms"), t("general.tiles.clients"), t("general.tiles.active"), t("list.csvMonthly"), t("general.notes")],
            [...list]
              .sort((x, y) => siteLabel(x).localeCompare(siteLabel(y), "es"))
              .map((x) => {
                const st = siteStats(x, clients)
                return [x.name, x.address, x.municipality, x.state, x.towers.length, x.towers.reduce((n, w) => n + (w.apartments ?? 0), 0) || null, x.rooms.length, st.clients, st.active, st.monthly || null, x.notes]
              })
          )
        }
      />
      {list.length > 0 && <TextField label={t("list.search")} value={q} onChange={setQ} hint={t("list.searchHint")} />}
      <p className="font-mono text-xs text-zinc-400">{t("list.count", { n: shown.length })}</p>
      {!list.length && <p className="text-sm text-zinc-400">{t("list.empty")}</p>}
      {list.length > 0 && !shown.length && <p className="text-sm text-zinc-400">{t("list.none")}</p>}
      <ul className="grid gap-2">
        {shown.map((s) => {
          const st = siteStats(s, clients)
          return (
            <li key={s.id}>
              <NavLink href={`?d=${s.id}`} className="grid gap-1 rounded-xl border border-white/10 p-3 outline-none hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm text-zinc-100">{s.name || t("list.untitled")}</span>
                  {st.monthly > 0 && <span className="shrink-0 font-mono text-xs text-emerald-300">{mxn(st.monthly)}</span>}
                </span>
                {(s.address || s.municipality) && <span className="text-xs text-zinc-300">{[s.address, s.municipality].filter(Boolean).join(" · ")}</span>}
                <span className="font-mono text-xs text-zinc-400">{t("list.summary", { towers: s.towers.length, rooms: s.rooms.length, clients: st.clients, active: st.active })}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SiteEditor({ t, s, section, clients, survey }: { t: T; s: Site; section: Section; clients: Client[]; survey: Survey | undefined }) {
  const up = (p: Partial<Site>) => saveSite({ ...s, ...p })
  const stats = siteStats(s, clients)
  const row = useRef<HTMLUListElement>(null)
  // Keep the current section visible in the scrolling row (only the row moves, not the page).
  useEffect(() => {
    const ul = row.current
    const a = ul?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!ul || !a) return
    const l = a.getBoundingClientRect()
    const r = ul.getBoundingClientRect()
    if (l.left < r.left) ul.scrollLeft -= r.left - l.left + 16
    else if (l.right > r.right) ul.scrollLeft += l.right - r.right + 16
  }, [section])
  return (
    <div className="mt-6 grid gap-5">
      <nav aria-label={t("nav.label")} className="sticky top-14 z-10 -mx-4 min-w-0 border-y border-white/10 bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <ul ref={row} className="flex gap-1 overflow-x-auto md:flex-wrap">
          <li className="shrink-0">
            <NavLink href="?" className="block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-zinc-300 hover:text-foreground">
              {t("nav.back")}
            </NavLink>
          </li>
          {SECTIONS.filter((k) => k !== "levantamiento" || survey).map((k) => (
            <li key={k} className="shrink-0">
              <NavLink
                href={`?d=${s.id}&s=${k}`}
                current={k === section}
                className="block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-zinc-300 hover:text-foreground aria-[current=page]:bg-white/10 aria-[current=page]:text-foreground"
              >
                {t(`nav.${k}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <h2 className="text-2xl font-light text-foreground">
        {siteLabel(s)} · {t(`nav.${section}`)}
      </h2>
      {section === "general" && <General t={t} s={s} up={up} stats={stats} />}
      {section === "torres" && <Towers t={t} s={s} up={up} stats={stats} />}
      {section === "cuartos" && <Rooms t={t} s={s} up={up} clients={clients} />}
      {section === "acceso" && <Access t={t} s={s} up={up} clients={clients} />}
      {section === "acuerdo" && <Agreement t={t} s={s} up={up} />}
      {section === "clientes" && <SiteClients t={t} s={s} clients={clients} />}
      {section === "levantamiento" && <SurveyTab t={t} survey={survey} />}
    </div>
  )
}

type Up = (p: Partial<Site>) => void

const NOTES_PATH = "/interno/admin/notas"

/** What is at this location now (owner, 2026-11-18: link the sections): tools left here and the notes about it. */
function AtSite({ t, s }: { t: T; s: Site }) {
  const tools = useSyncExternalStore(subscribeTools, toolsSnapshot, toolsServerSnapshot).list.filter((x) => x.holderKind === "despliegue" && x.siteId === s.id && x.quantity > 0)
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.snapshot, notesStore.serverSnapshot).list.filter((n) => n.linkKind === "site" && n.linkId === s.id && !n.doneAt)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="grid content-start gap-2 rounded-xl border border-white/10 p-3">
        <h3 className="text-sm font-medium text-foreground">{t("general.tools", { n: tools.length })}</h3>
        {!tools.length && <p className="text-xs text-zinc-400">{t("general.noTools")}</p>}
        <ul className="grid gap-1">
          {tools.map((x) => (
            <li key={x.id}>
              <a href={`/interno/herramientas/en-existencia?h=${x.id}`} className="text-sm text-zinc-200 underline-offset-4 hover:underline">
                {toolLabel(x)}
                {x.quantity > 1 ? ` × ${x.quantity}` : ""}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid content-start gap-2 rounded-xl border border-white/10 p-3">
        <h3 className="text-sm font-medium text-foreground">{t("general.siteNotes", { n: notes.length })}</h3>
        {!notes.length && <p className="text-xs text-zinc-400">{t("general.noSiteNotes")}</p>}
        <ul className="grid gap-1">
          {notes.map((n) => (
            <li key={n.id} className="text-sm text-zinc-200">
              {n.title || n.body.slice(0, 80)}
            </li>
          ))}
        </ul>
        <a href={NOTES_PATH} className="font-mono text-xs text-zinc-400 hover:text-zinc-100">
          {t("general.toNotes")} →
        </a>
      </section>
    </div>
  )
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

function General({ t, s, up, stats }: { t: T; s: Site; up: Up; stats: SiteStats }) {
  const apartments = s.towers.reduce((a, x) => a + (x.apartments ?? 0), 0)
  const capacity = s.rooms.map(roomCapacity).filter((x): x is number => x !== null)
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t("general.tiles.towers")} value={String(s.towers.length)} />
        <Tile label={t("general.tiles.apartments")} value={apartments ? String(apartments) : "—"} />
        <Tile label={t("general.tiles.rooms")} value={String(s.rooms.length)} />
        <Tile label={t("general.tiles.capacity")} value={capacity.length ? `${capacity.reduce((a, b) => a + b, 0)} Mbps` : "—"} />
        <Tile label={t("general.tiles.clients")} value={String(stats.clients)} />
        <Tile label={t("general.tiles.active")} value={String(stats.active)} />
        <Tile label={t("general.tiles.monthly")} value={mxn(stats.monthly)} hint={t("general.monthlyHint")} />
        <Tile label={t("general.tiles.cost")} value={mxn(siteCost(s))} hint={t("general.costHint")} />
        <Tile label={t("general.tiles.links")} value={mxn(linksCost(s))} hint={unpricedLinks(s) ? t("general.linksMissing", { n: unpricedLinks(s) }) : t("general.linksHint")} />
        <Tile label={t("general.tiles.profit")} value={mxn(siteProfit(s, stats.monthly))} hint={t("general.profitHint")} />
      </div>
      <div className={GRID}>
        <TextField label={t("general.name")} value={s.name} onChange={(v) => up({ name: v })} hint={t("general.nameHint")} />
        <TextField label={t("general.address")} value={s.address} onChange={(v) => up({ address: v })} />
      </div>
      <PlaceFields state={s.state} municipality={s.municipality} onChange={(p) => up(p)} />
      <AreaField label={t("general.notes")} value={s.notes} onChange={(v) => up({ notes: v })} />
      <AtSite t={t} s={s} />
      <RecordHistory kind="sites" id={s.id} />
      <button
        type="button"
        onClick={() => {
          // What still points to this location: said in the question, so nothing is left behind by surprise.
          const place = sitePlace(s.id)
          const items = new Map(catalogSnapshot().items.map((x) => [x.id, x]))
          const stock = placesStockItems(movesStore.list(), unitsStore.list(), place, items).length
          const nClients = clientsSnapshot().list.filter((c) => c.siteId === s.id).length
          const nTools = toolsSnapshot().list.filter((x) => x.holderKind === "despliegue" && x.siteId === s.id && x.quantity > 0).length
          const left = [nClients && t("general.leftClients", { n: nClients }), nTools && t("general.leftTools", { n: nTools }), stock && t("general.leftStock", { n: stock })].filter(Boolean)
          const ask = t("general.confirmRemove", { name: siteLabel(s) }) + (left.length ? `

${t("general.leftTitle")} ${left.join(", ")}. ${t("general.leftHint")}` : "")
          if (!window.confirm(ask)) return
          deleteSite(s.id)
          go("?")
        }}
        className={DANGER}
      >
        {t("general.remove")}
      </button>
    </div>
  )
}

function Towers({ t, s, up, stats }: { t: T; s: Site; up: Up; stats: SiteStats }) {
  const set = (x: Tower) => up({ towers: s.towers.map((y) => (y.id === x.id ? x : y)) })
  return (
    <div className="grid gap-3">
      <p className="text-sm text-zinc-300">{t("towers.intro")}</p>
      {!s.towers.length && <p className="text-sm text-zinc-400">{t("towers.none")}</p>}
      {s.towers.map((x, i) => {
        const b = stats.byTower[x.id] ?? { clients: 0, active: 0 }
        return (
          <div key={x.id} role="group" aria-label={towerLabel(x, i)} className={CARD}>
            <p className="text-sm font-medium text-zinc-100">{towerLabel(x, i)}</p>
            <div className={GRID}>
              <TextField label={t("towers.name")} value={x.name} onChange={(v) => set({ ...x, name: v })} hint={t("towers.nameHint")} />
              <PickField
                label={t("towers.room")}
                value={x.roomId}
                onChange={(roomId) => set({ ...x, roomId })}
                options={[{ value: "", label: t("towers.noRoom") }, ...s.rooms.map((r, k) => ({ value: r.id, label: roomLabel(r, k) }))]}
              />
              <NumberField label={t("towers.floors")} unit="#" integer optional max={200} value={x.floors} onChange={(v) => set({ ...x, floors: v })} hint={t("towers.floorsHint")} />
              <NumberField label={t("towers.apartments")} unit="#" integer optional max={5000} value={x.apartments} onChange={(v) => set({ ...x, apartments: v })} />
            </div>
            <AreaField label={t("towers.notes")} value={x.notes} onChange={(v) => set({ ...x, notes: v })} rows={2} />
            <p className="font-mono text-xs text-zinc-400">
              {t("towers.clients", { clients: b.clients, active: b.active, apartments: x.apartments ? "some" : "none", pct: x.apartments ? Math.round((b.clients / x.apartments) * 100) : 0 })}
            </p>
            <button type="button" onClick={() => window.confirm(t("towers.confirmRemove", { name: towerLabel(x, i) })) && up(removeTower(s, x.id))} className={DANGER}>
              {t("towers.remove")}
            </button>
          </div>
        )
      })}
      <button type="button" onClick={() => up({ towers: [...s.towers, newTower({ roomId: s.rooms.length === 1 ? s.rooms[0].id : "" })] })} className={SMALL}>
        {t("towers.add")}
      </button>
    </div>
  )
}

function Rooms({ t, s, up, clients }: { t: T; s: Site; up: Up; clients: Client[] }) {
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list
  const carriers = providers.filter((p) => isKind(p, "carrier"))
  const set = (r: Room) => up({ rooms: s.rooms.map((x) => (x.id === r.id ? r : x)) })
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("rooms.intro")}</p>
      {s.rooms.map((r, i) => (
        <RoomCard
          key={r.id}
          t={t}
          s={s}
          r={r}
          i={i}
          carriers={carriers}
          counts={portClients(s, r, clients)}
          set={set}
          remove={() => window.confirm(t("rooms.confirmRemove", { name: roomLabel(r, i) })) && up(removeRoom(s, r.id))}
        />
      ))}
      <button type="button" onClick={() => up({ rooms: [...s.rooms, newRoom()] })} className={SMALL}>
        {t("rooms.add")}
      </button>
    </div>
  )
}

function RoomCard({ t, s, r, i, carriers, counts, set, remove }: { t: T; s: Site; r: Room; i: number; carriers: Provider[]; counts: Record<string, number>; set: (r: Room) => void; remove: () => void }) {
  const up = (p: Partial<Room>) => set({ ...r, ...p })
  const served = s.towers.map((x, k) => ({ x, k })).filter(({ x }) => x.roomId === r.id)
  const olts = r.equipment.filter((e) => e.kind === "olt")
  const setEq = (e: Equipment) => up({ equipment: r.equipment.map((x) => (x.id === e.id ? e : x)) })
  const setCa = (c: RoomCarrier) => up({ carriers: r.carriers.map((x) => (x.id === c.id ? c : x)) })
  const setPo = (p: PonPort) => up({ ports: r.ports.map((x) => (x.id === p.id ? p : x)) })
  const capacity = roomCapacity(r)
  return (
    <section aria-labelledby={`room-${r.id}`} className="grid gap-5 rounded-xl border border-white/15 p-4">
      <div className="grid gap-1">
        <h3 id={`room-${r.id}`} className="text-lg font-medium text-foreground">
          {roomLabel(r, i)}
        </h3>
        <p className="text-xs text-zinc-400">{served.length ? t("rooms.serves", { towers: served.map(({ x, k }) => towerLabel(x, k)).join(", ") }) : t("rooms.servesNone")}</p>
      </div>
      <div className={GRID}>
        <TextField label={t("rooms.name")} value={r.name} onChange={(v) => up({ name: v })} hint={t("rooms.nameHint")} />
        <TextField label={t("rooms.location")} value={r.location} onChange={(v) => up({ location: v })} hint={t("rooms.locationHint")} />
        <TextField label={t("rooms.breaker")} value={r.breaker} onChange={(v) => up({ breaker: v })} hint={t("rooms.breakerHint")} />
        <NumberField label={t("rooms.upsHours")} unit="h" optional max={1000} value={r.upsHours} onChange={(v) => up({ upsHours: v })} />
      </div>
      <AreaField label={t("rooms.access")} value={r.access} onChange={(v) => up({ access: v })} hint={t("rooms.accessHint")} rows={2} />
      <AreaField label={t("rooms.powerNotes")} value={r.powerNotes} onChange={(v) => up({ powerNotes: v })} rows={2} />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("rooms.equipment.title")}</legend>
        {!r.equipment.length && <p className="text-sm text-zinc-400">{t("rooms.equipment.none")}</p>}
        {r.equipment.map((e, k) => (
          <div key={e.id} role="group" aria-label={`${t(`rooms.equipment.kinds.${e.kind}`)} ${k + 1}`} className={CARD}>
            <p className="text-sm text-zinc-100">{t(`rooms.equipment.kinds.${e.kind}`)}</p>
            <div className={GRID}>
              <TextField label={t("rooms.equipment.model")} value={e.model} onChange={(v) => setEq({ ...e, model: v })} />
              <TextField label={t("rooms.equipment.serial")} value={e.serial} onChange={(v) => setEq({ ...e, serial: v.toUpperCase().slice(0, 60) })} />
              <TextField label={t("rooms.equipment.ip")} value={e.ip} onChange={(v) => setEq({ ...e, ip: v })} />
              <TextField label={t("rooms.equipment.firmware")} value={e.firmware} onChange={(v) => setEq({ ...e, firmware: v })} />
            </div>
            <AreaField label={t("rooms.equipment.notes")} value={e.notes} onChange={(v) => setEq({ ...e, notes: v })} rows={2} />
            <button type="button" onClick={() => up({ equipment: r.equipment.filter((x) => x.id !== e.id), ports: r.ports.map((p) => (p.oltId === e.id ? { ...p, oltId: "" } : p)) })} className={DANGER}>
              {t("rooms.equipment.remove")}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_KINDS.map((kind) => (
            <button key={kind} type="button" onClick={() => up({ equipment: [...r.equipment, newEquipment(kind)] })} className={SMALL}>
              {t(`rooms.equipment.add.${kind}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("rooms.carriers.title")}</legend>
        {!r.carriers.length && <p className="text-sm text-zinc-400">{t("rooms.carriers.none")}</p>}
        {r.carriers.map((c, k) => {
          const known = carriers.find((p) => p.id === c.providerId)
          return (
            <div key={c.id} role="group" aria-label={`${t("rooms.carriers.provider")} ${k + 1}`} className={CARD}>
              <div className={GRID}>
                <PickField
                  label={t("rooms.carriers.provider")}
                  value={c.providerId}
                  onChange={(providerId) => {
                    const p = carriers.find((x) => x.id === providerId)
                    setCa({ ...c, providerId, name: p ? providerName(p) : c.name })
                  }}
                  hint={t("rooms.carriers.providerHint")}
                  options={[
                    { value: "", label: t("rooms.carriers.other") },
                    ...(c.providerId && !known ? [{ value: c.providerId, label: c.name || c.providerId.slice(0, 8) }] : []),
                    ...carriers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 8) })),
                  ]}
                />
                {!c.providerId && <TextField label={t("rooms.carriers.name")} value={c.name} onChange={(v) => setCa({ ...c, name: v })} />}
                <NumberField label={t("rooms.carriers.down")} unit="Mbps" optional max={1e6} value={c.downMbps} onChange={(v) => setCa({ ...c, downMbps: v })} />
                <NumberField label={t("rooms.carriers.up")} unit="Mbps" optional max={1e6} value={c.upMbps} onChange={(v) => setCa({ ...c, upMbps: v })} />
                <NumberField label={t("rooms.carriers.monthly")} unit="MXN" optional max={1e7} precision={2} value={c.monthly} onChange={(v) => setCa({ ...c, monthly: v })} hint={t("rooms.carriers.monthlyHint")} />
                <TextField label={t("rooms.carriers.ip")} value={c.ip} onChange={(v) => setCa({ ...c, ip: v })} hint={t("rooms.carriers.ipHint")} />
                <TextField label={t("rooms.carriers.account")} value={c.account} onChange={(v) => setCa({ ...c, account: v })} />
              </div>
              <AreaField label={t("rooms.carriers.notes")} value={c.notes} onChange={(v) => setCa({ ...c, notes: v })} rows={2} />
              <button type="button" onClick={() => up({ carriers: r.carriers.filter((x) => x.id !== c.id) })} className={DANGER}>
                {t("rooms.carriers.remove")}
              </button>
            </div>
          )
        })}
        <button type="button" onClick={() => up({ carriers: [...r.carriers, newRoomCarrier()] })} className={SMALL}>
          {t("rooms.carriers.add")}
        </button>
        {capacity !== null && <p className="font-mono text-xs text-zinc-300">{t("rooms.carriers.capacity", { mbps: capacity })}</p>}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("rooms.ports.title")}</legend>
        {!r.ports.length && <p className="text-sm text-zinc-400">{t("rooms.ports.none")}</p>}
        {r.ports.map((p, k) => (
          <div key={p.id} role="group" aria-label={`${t("rooms.ports.port")} ${p.port || k + 1}`} className={CARD}>
            <div className={GRID}>
              <TextField label={t("rooms.ports.port")} value={p.port} onChange={(v) => setPo({ ...p, port: v })} hint={t("rooms.ports.portHint")} />
              {olts.length > 1 && (
                <PickField label={t("rooms.ports.olt")} value={p.oltId} onChange={(oltId) => setPo({ ...p, oltId })} options={[{ value: "", label: "—" }, ...olts.map((o, j) => ({ value: o.id, label: o.model || `OLT ${j + 1}` }))]} />
              )}
              <PickField
                label={t("rooms.ports.tower")}
                value={p.towerId}
                onChange={(towerId) => setPo({ ...p, towerId })}
                options={[{ value: "", label: t("rooms.ports.noTower") }, ...s.towers.map((x, j) => ({ value: x.id, label: towerLabel(x, j) }))]}
              />
              <TextField label={t("rooms.ports.splitters")} value={p.splitters} onChange={(v) => setPo({ ...p, splitters: v })} hint={t("rooms.ports.splittersHint")} />
            </div>
            <AreaField label={t("rooms.ports.notes")} value={p.notes} onChange={(v) => setPo({ ...p, notes: v })} rows={2} />
            <p className="font-mono text-xs text-zinc-300" title={t("rooms.ports.clientsHint")}>
              {t("rooms.ports.clients", { n: counts[p.id] ?? 0 })}
            </p>
            <button type="button" onClick={() => up({ ports: r.ports.filter((x) => x.id !== p.id) })} className={DANGER}>
              {t("rooms.ports.remove")}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => up({ ports: [...r.ports, newPort()] })} className={SMALL}>
          {t("rooms.ports.add")}
        </button>
        {r.ports.length > 0 && <p className="text-xs text-zinc-400">{t("rooms.ports.clientsHint")}</p>}
      </fieldset>

      <button type="button" onClick={remove} className={DANGER}>
        {t("rooms.remove")}
      </button>
    </section>
  )
}

function Access({ t, s, up, clients }: { t: T; s: Site; up: Up; clients: Client[] }) {
  const admins = clients.filter((c) => c.kind === "administracion")
  const admin = clients.find((c) => c.id === s.adminClientId)
  const setC = (k: SiteContact) => up({ contacts: s.contacts.map((x) => (x.id === k.id ? k : x)) })
  const adminContact = admin ? [admin.contacts[0]?.name, admin.phone || admin.contacts[0]?.phone, admin.email].filter(Boolean).join(" · ") : ""
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <PickField
          label={t("access.admin")}
          value={s.adminClientId}
          onChange={(adminClientId) => up({ adminClientId })}
          hint={t("access.adminHint")}
          options={[
            { value: "", label: t("access.adminNone") },
            ...(s.adminClientId && !admin ? [{ value: s.adminClientId, label: s.adminClientId.slice(0, 8) }] : []),
            ...admins.map((c) => ({ value: c.id, label: clientLabel(c) })),
          ]}
        />
        {!admins.length && <p className="text-xs text-amber-200">{t("access.adminMissing")}</p>}
        {adminContact && <p className="text-xs text-zinc-300">{t("access.adminContact", { contact: adminContact })}</p>}
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("access.contacts")}</legend>
        <p className="text-xs text-zinc-400">{t("access.contactsHint")}</p>
        {!s.contacts.length && <p className="text-sm text-zinc-400">{t("access.contactsNone")}</p>}
        {s.contacts.map((k, i) => (
          <div key={k.id} role="group" aria-label={`${t("access.contacts")} ${i + 1}`} className={CARD}>
            <div className={GRID}>
              <TextField label={t("access.contactName")} value={k.name} onChange={(v) => setC({ ...k, name: v })} />
              <TextField label={t("access.contactRole")} value={k.role} onChange={(v) => setC({ ...k, role: v })} />
              <TextField label={t("access.contactPhone")} value={k.phone} onChange={(v) => setC({ ...k, phone: v })} type="tel" />
              <TextField label={t("access.contactEmail")} value={k.email} onChange={(v) => setC({ ...k, email: v })} type="email" />
            </div>
            <button type="button" onClick={() => up({ contacts: s.contacts.filter((x) => x.id !== k.id) })} className={DANGER}>
              {t("access.removeContact")}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => up({ contacts: [...s.contacts, newSiteContact()] })} className={SMALL}>
          {t("access.addContact")}
        </button>
      </fieldset>
      <AreaField label={t("access.rules")} value={s.accessRules} onChange={(v) => up({ accessRules: v })} hint={t("access.rulesHint")} />
      <div className={GRID}>
        <TextField label={t("access.hours")} value={s.accessHours} onChange={(v) => up({ accessHours: v })} />
      </div>
      <AreaField label={t("access.keys")} value={s.keys} onChange={(v) => up({ keys: v })} hint={t("access.keysHint")} rows={2} />
    </div>
  )
}

function Agreement({ t, s, up }: { t: T; s: Site; up: Up }) {
  const today = localToday()
  const a = agreementStatus(s, today)
  return (
    <div className="grid gap-5">
      <div className={GRID}>
        <NumberField label={t("agreement.rent")} unit={t("agreement.perMonth")} optional max={1e7} value={s.rentMonthly} onChange={(v) => up({ rentMonthly: v })} />
        <PickField label={t("agreement.powerPayer")} value={s.powerPayer} onChange={(powerPayer) => up({ powerPayer })} options={POWER_PAYERS.map((p) => ({ value: p, label: t(`agreement.payers.${p}`) }))} />
        <NumberField label={t("agreement.power")} unit={t("agreement.perMonth")} optional max={1e7} value={s.powerMonthly} onChange={(v) => up({ powerMonthly: v })} />
        <DateField label={t("agreement.start")} value={s.contractStart} onChange={(v) => up({ contractStart: v })} />
        <DateField label={t("agreement.end")} value={s.contractEnd} onChange={(v) => up({ contractEnd: v })} />
        <PickField label={t("agreement.renewal")} value={s.renewal} onChange={(renewal) => up({ renewal })} options={RENEWALS.map((x) => ({ value: x, label: t(`agreement.renewals.${x || "none"}`) }))} />
        <NumberField label={t("agreement.notice")} unit={t("agreement.days")} optional max={730} value={s.noticeDays} onChange={(v) => up({ noticeDays: v })} hint={t("agreement.noticeHint", { n: DEFAULT_NOTICE_DAYS })} />
        <NumberField label={t("agreement.increase")} unit="%" optional max={100} value={s.rentIncreasePct} onChange={(v) => up({ rentIncreasePct: v })} hint={t("agreement.increaseHint")} />
      </div>
      <p className="text-sm text-zinc-100">{t("agreement.cost", { cost: mxn(siteCost(s)) })}</p>
      {a.status === "renovado" && <p className="text-sm text-zinc-300">{t("agreement.rolled", { date: a.end })}</p>}
      {a.status === "por-vencer" && <p className="text-sm text-amber-200">{t("agreement.ends", { days: a.daysLeft ?? 0, date: a.end })}</p>}
      {a.status === "vencido" && <p className="text-sm text-red-300">{t("agreement.ended", { date: a.end })}</p>}
      <AreaField label={t("agreement.notes")} value={s.agreementNotes} onChange={(v) => up({ agreementNotes: v })} hint={t("agreement.notesHint")} />
    </div>
  )
}

function SiteClients({ t, s, clients }: { t: T; s: Site; clients: Client[] }) {
  const mine = clients.filter((c) => c.siteId === s.id).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "es"))
  const groups = [...s.towers.map((x, i) => ({ id: x.id, label: towerLabel(x, i) })), { id: "", label: t("clients.noTower") }]
    .map((g) => ({ ...g, list: mine.filter((c) => (g.id ? c.towerId === g.id : !s.towers.some((x) => x.id === c.towerId))) }))
    .filter((g) => g.list.length)
  return (
    <div className="grid gap-4">
      <p className="text-sm text-zinc-300">{t("clients.intro")}</p>
      {!mine.length && <p className="text-sm text-zinc-400">{t("clients.none")}</p>}
      {groups.map((g) => (
        <section key={g.id || "none"} aria-label={g.label} className="grid gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {g.label} · {g.list.length}
          </h3>
          <ul className="grid gap-1">
            {g.list.map((c) => (
              <li key={c.id}>
                <a href={`/interno/admin/clientes?c=${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <span className="min-w-0 truncate text-zinc-100">
                    {clientLabel(c)}
                    {c.apartment ? <span className="text-zinc-400"> · {c.apartment}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-300">{t(`clients.statuses.${clientStatus(c)}`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
