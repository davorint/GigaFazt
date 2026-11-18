"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { SECTIONS, completeness, newSurvey, readSurveyFile, surveyFile, surveyFileItems, type Section, type Survey } from "@/lib/survey/model"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { readState } from "@/lib/sync/state"
import { deleteSurvey, importSurveys, saveSurvey, subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { decodeItem, type Item } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, importItems, subscribeCatalog } from "@/lib/materials/store"
import { usedItems, withPicks } from "@/lib/survey/materials"
import { SelectField } from "@/components/mikrotik/SelectField"
import { AreasSection, CarriersSection, CommercialSection, ContactsSection, IdentSection, PendingSection, RoomSection, RoutesSection, type SectionProps } from "./SurveySections"
import { TowersSection } from "./SurveyTowers"
import { DesignSection } from "./SurveyDesign"
import { MaterialsSection } from "./SurveyMaterials"

/** Each section's page in the URL: ?l=<survey>&s=<section>. */
export const SECTION_SLUG: Record<Section, string> = {
  ident: "identificacion",
  contacts: "contactos",
  commercial: "comercial",
  room: "cuarto",
  towers: "torres",
  design: "diseno",
  routes: "rutas",
  areas: "areas",
  carriers: "carriers",
  pending: "pendientes",
  materials: "materiales",
}
const sectionOf = (slug: string | null): Section => (SECTIONS.find((k) => SECTION_SLUG[k] === slug) ?? "ident")
const hrefOf = (id: string | null, section?: Section) => {
  if (!id) return "?"
  const q = new URLSearchParams({ l: id })
  if (section && section !== "ident") q.set("s", SECTION_SLUG[section])
  return `?${q.toString()}`
}

// The open survey and section live in the URL, so every section is its own page and the phone's back button walks back.
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const readSearch = () => window.location.search
const go = (href: string) => {
  const url = href === "?" ? window.location.pathname : `${window.location.pathname}${href}`
  window.history.pushState(null, "", url)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo(0, 0)
}
/** A real link (opens in a new tab, readable by screen readers) that changes page in place on a plain click. */
function NavLink({ href, className, current, children, label }: { href: string; className: string; current?: boolean; children: ReactNode; label?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    go(href)
  }
  return (
    <a href={href} onClick={onClick} aria-current={current ? "page" : undefined} aria-label={label} className={className}>
      {children}
    </a>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "levantamiento"

const BTN = "inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** Totals over every section: how much of the survey is filled. */
function progress(s: Survey) {
  return SECTIONS.reduce((a, k) => {
    const c = completeness(s, k)
    return { done: a.done + c.done, total: a.total + c.total }
  }, { done: 0, total: 0 })
}

const surveyList = () => surveysSnapshot().list

export function SurveysApp() {
  const t = useTranslations("levantamientos")
  const store = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot)
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const search = useSyncExternalStore(subscribeUrl, readSearch, () => "")
  useDropUntouched(new URLSearchParams(search).get("l"), surveyList, deleteSurvey)
  if (!store.loaded) return null
  const q = new URLSearchParams(search)
  const open = q.get("l")
  const survey = open ? store.list.find((x) => x.id === open) : undefined
  return (
    <>
      {!store.persisted && (
        <p role="alert" className="mt-4 rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      {open ? (
        survey ? (
          <Editor key={survey.id} s={survey} section={sectionOf(q.get("s"))} catalog={catalog.items} />
        ) : (
          <div className="mt-8 grid gap-4">
            <p className="text-sm text-zinc-300">{t("editor.notFound")}</p>
            <NavLink href="?" className={`${BTN} w-fit`}>
              {t("editor.backToList")}
            </NavLink>
          </div>
        )
      ) : (
        <List list={store.list} catalog={catalog.items} />
      )}
    </>
  )
}

function List({ list, catalog }: { list: Survey[]; catalog: Item[] }) {
  const t = useTranslations("levantamientos")
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const create = (v: Record<string, string>) => {
    const base = newSurvey(t("towers.defaultName", { l: "A" }))
    // Starts with the phone's name from the sync bar as who did it (editable).
    const s = { ...base, ident: { ...base.ident, name: v.name, address: v.address, municipality: v.municipality, surveyors: readState().name } }
    saveSurvey(s)
    go(hrefOf(s.id))
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    const got = readSurveyFile(text)
    if (!got) return setMsg({ ok: false, text: t("list.badFile") })
    // The master-list items the surveys use: only the ones this browser doesn't have yet.
    importItems(surveyFileItems(text).map(decodeItem).filter((x): x is Item => x !== null), false)
    const r = importSurveys(got)
    setMsg({ ok: true, text: t("list.imported", { added: r.added, replaced: r.replaced, kept: r.kept }) })
  }
  const exportAll = () => {
    const items = [...new Map(list.flatMap((s) => usedItems(s, catalog)).map((x) => [x.id, x])).values()]
    download(`levantamientos-${new Date().toISOString().slice(0, 10)}.json`, surveyFile(list.map((s) => withPicks(s, catalog)), items))
  }
  return (
    <div className="mt-8 grid gap-4">
      <QuickAdd
        title={t("list.new")}
        submit={t("list.newSubmit")}
        fields={[
          { key: "name", label: t("ident.name"), required: true },
          { key: "address", label: t("ident.address") },
          { key: "municipality", label: t("ident.municipality") },
        ]}
        onAdd={create}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => file.current?.click()} className={BTN}>
          {t("list.import")}
        </button>
        {list.length > 0 && (
          <button type="button" onClick={exportAll} className={BTN}>
            {t("list.exportAll")}
          </button>
        )}
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text}
        </p>
      )}
      {!list.length ? (
        <p className="text-sm text-zinc-400">{t("list.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => {
            const p = progress(s)
            return (
              <li key={s.id}>
                <NavLink href={hrefOf(s.id)} className="surface grid h-full w-full gap-1.5 rounded-2xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-base font-medium text-foreground">{s.ident.name || t("list.untitled")}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${s.status === "done" ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-zinc-300"}`}>{t(`list.status.${s.status}`)}</span>
                  </span>
                  {s.ident.address && <span className="text-sm text-zinc-300">{s.ident.address}</span>}
                  <span className="font-mono text-xs text-zinc-400">
                    {t("list.progress", { done: p.done, total: p.total })} · {t("list.updated", { date: new Date(s.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) })}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const VIEWS: Record<Section, (p: SectionProps) => ReactNode> = {
  ident: IdentSection,
  contacts: ContactsSection,
  commercial: CommercialSection,
  room: RoomSection,
  towers: TowersSection,
  design: DesignSection,
  routes: RoutesSection,
  areas: AreasSection,
  carriers: CarriersSection,
  pending: PendingSection,
  materials: MaterialsSection,
}

/** The menu of a survey's sections: every section a link, the current one marked; one row that scrolls on phones. */
function SurveyNav({ s, section }: { s: Survey; section: Section }) {
  const t = useTranslations("levantamientos")
  const row = useRef<HTMLUListElement>(null)
  // Keep the current link visible in the scrolling row (only the row moves, not the page).
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
    <nav aria-label={t("nav.label")} className="sticky top-0 z-20 -mx-4 min-w-0 border-b border-white/10 bg-background/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <ul ref={row} className="flex gap-1 overflow-x-auto py-2 text-sm [scrollbar-width:none] md:flex-wrap md:overflow-visible">
        <li className="shrink-0">
          <NavLink href="?" className="block rounded-md px-2.5 py-1.5 text-zinc-400 hover:text-foreground">
            ← {t("nav.list")}
          </NavLink>
        </li>
        {SECTIONS.map((k) => {
          const c = completeness(s, k)
          return (
            <li key={k} className="shrink-0">
              <NavLink
                href={hrefOf(s.id, k)}
                current={k === section}
                className="block rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-foreground aria-[current=page]:bg-white/10 aria-[current=page]:text-foreground"
              >
                {t(`sections.${k}`)}
                {c.total > 0 && <span className="ml-1.5 font-mono text-[11px] text-zinc-400 [[aria-current=page]_&]:text-zinc-200">{`${c.done}/${c.total}`}</span>}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Editor({ s, section, catalog }: { s: Survey; section: Section; catalog: Item[] }) {
  const t = useTranslations("levantamientos")
  const k = SECTIONS.indexOf(section)
  const View = VIEWS[section]
  const prev = SECTIONS[k - 1]
  const next = SECTIONS[k + 1]
  const remove = () => {
    if (!window.confirm(t("editor.confirmDelete", { name: s.ident.name || t("list.untitled") }))) return
    deleteSurvey(s.id)
    go("?")
  }
  const c = completeness(s, section)
  return (
    <div className="mt-6 grid gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-light tracking-tight text-foreground sm:text-3xl">{s.ident.name || t("list.untitled")}</h2>
        <span className="font-mono text-xs text-zinc-400">{t("editor.saved")}</span>
      </div>
      <SurveyNav s={s} section={section} />
      <section aria-labelledby="seccion-titulo" className="grid gap-4">
        <h3 id="seccion-titulo" className="text-lg font-medium text-foreground">
          {t(`sections.${section}`)}
          {c.total > 0 && <span className="ml-2 font-mono text-sm text-zinc-400">{`${c.done}/${c.total}`}</span>}
        </h3>
        <View s={s} set={saveSurvey} />
      </section>
      <div className="flex gap-2">
        {prev && (
          <NavLink href={hrefOf(s.id, prev)} className={`${BTN} flex-1 justify-center sm:flex-none`} label={`${t("editor.prev")}: ${t(`sections.${prev}`)}`}>
            ← {t(`sections.${prev}`)}
          </NavLink>
        )}
        {next && (
          <NavLink href={hrefOf(s.id, next)} className={`${PRIMARY} flex-1 sm:flex-none`} label={`${t("editor.next")}: ${t(`sections.${next}`)}`}>
            {t(`sections.${next}`)} →
          </NavLink>
        )}
      </div>
      <div className="grid gap-4 border-t border-white/10 pt-5">
        <SelectField label={t("editor.status")} value={s.status} onChange={(v) => saveSurvey({ ...s, status: v === "done" ? "done" : "draft" })}>
          <option value="draft">{t("list.status.draft")}</option>
          <option value="done">{t("list.status.done")}</option>
        </SelectField>
        <RecordHistory kind="surveys" id={s.id} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download(`levantamiento-${slug(s.ident.name)}.json`, surveyFile([withPicks(s, catalog)], usedItems(s, catalog)))} className={BTN}>
            {t("editor.export")}
          </button>
          <button type="button" onClick={remove} className="h-11 rounded-full border border-red-400/30 px-5 text-sm text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {t("editor.delete")}
          </button>
        </div>
      </div>
    </div>
  )
}
