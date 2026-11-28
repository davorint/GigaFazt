"use client"

import { SECTIONS as SURVEY_SECTIONS, completeness, type Survey } from "@/lib/survey/model"
import { subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import type { Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { mxn } from "@/lib/materials/catalog"
import { missingFields, newSite, siteLabel, towerApartments, type Site } from "@/lib/sites/model"
import { siteStats } from "@/lib/sites/stats"
import { useDropUntouched } from "@/components/interno/useDropUntouched"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { ExportButton } from "@/components/interno/ExportButton"
import { toCsv } from "@/lib/csv"
import { deleteSite, saveSite, sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { SiteSheet } from "./SiteSheet"

type T = ReturnType<typeof useTranslations>
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
  if (open)
    return (
      <SiteSheet
        t={t}
        s={open}
        sites={store.list}
        clients={clients}
        surveys={surveys.list}
        onBack={(e) => {
          if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return
          e?.preventDefault()
          go("?")
        }}
      />
    )
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
                return [x.name, x.address, x.municipality, x.state, x.towers.length, x.towers.reduce((n, w) => n + (towerApartments(w) ?? 0), 0) || null, x.rooms.length, st.clients, st.active, st.monthly || null, x.notes]
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
          const missing = missingFields(s).length
          return (
            <li key={s.id}>
              <NavLink href={`?d=${s.id}`} className="grid gap-1 rounded-xl border border-white/10 p-3 outline-none hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm text-zinc-100">{s.name || t("list.untitled")}</span>
                  {st.monthly > 0 && <span className="shrink-0 font-mono text-xs text-emerald-300">{mxn(st.monthly)}</span>}
                </span>
                {(s.address || s.municipality) && <span className="text-xs text-zinc-300">{[s.address, s.municipality].filter(Boolean).join(" · ")}</span>}
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-zinc-400">{t("list.summary", { towers: s.towers.length, rooms: s.rooms.length, clients: st.clients, active: st.active })}</span>
                  {missing > 0 && <span className="font-mono text-[0.7rem] text-amber-200/80">{t("sheet.missing", { n: missing })}</span>}
                </span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

