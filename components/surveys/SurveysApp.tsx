"use client"

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { SECTIONS, completeness, newSurvey, readSurveyFile, surveyFile, type Section, type Survey } from "@/lib/survey/model"
import { deleteSurvey, importSurveys, saveSurvey, subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { SelectField } from "@/components/mikrotik/SelectField"
import { AreasSection, CarriersSection, CommercialSection, ContactsSection, IdentSection, PendingSection, RoomSection, RoutesSection, type SectionProps } from "./SurveySections"
import { TowersSection } from "./SurveyTowers"
import { DesignSection } from "./SurveyDesign"

// The open survey lives in the URL (?l=<id>) so the phone's back button returns to the list.
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const readOpen = () => new URLSearchParams(window.location.search).get("l")
const go = (id: string | null) => {
  const url = id ? `${window.location.pathname}?l=${encodeURIComponent(id)}` : window.location.pathname
  window.history.pushState(null, "", url)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo(0, 0)
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "levantamiento"

const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** Totals over every section: how much of the survey is filled. */
function progress(s: Survey) {
  return SECTIONS.reduce((a, k) => {
    const c = completeness(s, k)
    return { done: a.done + c.done, total: a.total + c.total }
  }, { done: 0, total: 0 })
}

export function SurveysApp() {
  const t = useTranslations("levantamientos")
  const store = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot)
  const open = useSyncExternalStore(subscribeUrl, readOpen, () => null)
  if (!store.loaded) return null
  const survey = open ? store.list.find((x) => x.id === open) : undefined
  return (
    <>
      {!store.persisted && (
        <p role="alert" className="mt-4 rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      {open ? survey ? <Editor key={survey.id} s={survey} /> : <p className="mt-8 text-sm text-zinc-300">{t("editor.notFound")}</p> : <List list={store.list} />}
      {open && !survey && (
        <button type="button" onClick={() => go(null)} className={`${BTN} mt-4`}>
          {t("editor.backToList")}
        </button>
      )}
    </>
  )
}

function List({ list }: { list: Survey[] }) {
  const t = useTranslations("levantamientos")
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const create = () => {
    const s = newSurvey(t("towers.defaultName", { l: "A" }))
    saveSurvey(s)
    go(s.id)
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const got = readSurveyFile(await f.text())
    if (!got) return setMsg({ ok: false, text: t("list.badFile") })
    const r = importSurveys(got)
    setMsg({ ok: true, text: t("list.imported", { added: r.added, replaced: r.replaced, kept: r.kept }) })
  }
  return (
    <div className="mt-8 grid gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={create} className={PRIMARY}>
          {t("list.new")}
        </button>
        <button type="button" onClick={() => file.current?.click()} className={BTN}>
          {t("list.import")}
        </button>
        {list.length > 0 && (
          <button type="button" onClick={() => download(`levantamientos-${new Date().toISOString().slice(0, 10)}.json`, surveyFile(list))} className={BTN}>
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
                <button type="button" onClick={() => go(s.id)} className="surface grid h-full w-full gap-1.5 rounded-2xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-base font-medium text-foreground">{s.ident.name || t("list.untitled")}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${s.status === "done" ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-zinc-300"}`}>{t(`list.status.${s.status}`)}</span>
                  </span>
                  {s.ident.address && <span className="text-sm text-zinc-300">{s.ident.address}</span>}
                  <span className="font-mono text-xs text-zinc-400">
                    {t("list.progress", { done: p.done, total: p.total })} · {t("list.updated", { date: new Date(s.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) })}
                  </span>
                </button>
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
}

function Editor({ s }: { s: Survey }) {
  const t = useTranslations("levantamientos")
  const [section, setSection] = useState<Section>("ident")
  const k = SECTIONS.indexOf(section)
  const View = VIEWS[section]
  const move = (to: number) => {
    setSection(SECTIONS[to])
    document.getElementById("levantamiento")?.scrollIntoView({ block: "start" })
  }
  const remove = () => {
    if (!window.confirm(t("editor.confirmDelete", { name: s.ident.name || t("list.untitled") }))) return
    deleteSurvey(s.id)
    go(null)
  }
  const label = (x: Section) => {
    const c = completeness(s, x)
    return `${t(`sections.${x}`)} (${c.done}/${c.total})`
  }
  return (
    <div id="levantamiento" className="mt-6 grid scroll-mt-4 gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(null)} className={BTN}>
          ← {t("editor.backToList")}
        </button>
        <span className="font-mono text-xs text-zinc-400">{t("editor.saved")}</span>
      </div>
      <h2 className="text-2xl font-light tracking-tight text-foreground sm:text-3xl">{s.ident.name || t("list.untitled")}</h2>
      <div className="sticky top-0 z-20 -mx-4 grid gap-2 border-b border-white/10 bg-background/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <SelectField label={t("editor.section")} value={section} onChange={(v) => setSection(v as Section)}>
          {SECTIONS.map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </SelectField>
      </div>
      <section aria-label={t(`sections.${section}`)} className="grid gap-4">
        <h3 className="text-lg font-medium text-foreground">{label(section)}</h3>
        <View s={s} set={saveSurvey} />
      </section>
      <div className="flex gap-2">
        <button type="button" onClick={() => move(k - 1)} disabled={k === 0} className={`${BTN} flex-1 disabled:opacity-40 sm:flex-none`}>
          ← {t("editor.prev")}
        </button>
        <button type="button" onClick={() => move(k + 1)} disabled={k === SECTIONS.length - 1} className={`${PRIMARY} flex-1 disabled:opacity-40 sm:flex-none`}>
          {t("editor.next")} →
        </button>
      </div>
      <div className="grid gap-4 border-t border-white/10 pt-5">
        <SelectField label={t("editor.status")} value={s.status} onChange={(v) => saveSurvey({ ...s, status: v === "done" ? "done" : "draft" })}>
          <option value="draft">{t("list.status.draft")}</option>
          <option value="done">{t("list.status.done")}</option>
        </SelectField>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download(`levantamiento-${slug(s.ident.name)}.json`, surveyFile([s]))} className={BTN}>
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
