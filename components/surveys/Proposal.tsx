"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { towerUnits, type Survey } from "@/lib/survey/model"
import { addOns, plans } from "@/lib/plans"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { formatMxn, speedLabel } from "@/lib/format"

/** What the survey's designs put in the building: floor boxes and the apartment ports they give. */
function installed(s: Survey) {
  let boxes = 0
  let ports = 0
  for (const t of s.towers) for (const f of t.design?.feeds ?? []) for (const b of f.branches) for (const st of b.stops) if (st.split > 1) {
    boxes++
    ports += st.split
  }
  return { boxes, ports }
}

/**
 * The proposal for a building's administrator (owner, 2026-11-19: the offer only, never our costs): the building as
 * surveyed, what we install at no cost to it, and the plans its residents can sign up for. A printable page (the
 * browser's "Imprimir" saves it as PDF), light on dark so it prints as it looks.
 */
export function Proposal() {
  const t = useTranslations("propuesta")
  const tp = useTranslations("plans")
  const id = useSearchParams().get("l") ?? ""
  const store = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot)
  if (!store.loaded) return null
  const s = store.list.find((x) => x.id === id)
  if (!s) return <p className="mt-10 text-sm text-zinc-300">{t("notFound")}</p>
  const apartments = s.towers.reduce((a, x) => a + towerUnits(x), 0) || s.commercial.units || 0
  const floors = Math.max(0, ...s.towers.map((x) => x.floorsAbove ?? 0))
  const { boxes, ports } = installed(s)
  const today = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
  const wa = isPlaceholder(company.whatsapp) ? "" : company.whatsapp
  const tv = addOns.find((a) => a.id === "tv")
  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="h-10 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {t("print")}
        </button>
        <a href={`/interno/levantamientos?l=${s.id}`} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5">
          {t("back")}
        </a>
        <p className="basis-full text-xs text-zinc-400">{t("printHint")}</p>
      </div>

      <article className="grid gap-6 rounded-xl bg-white p-6 text-zinc-900 sm:p-10 print:rounded-none print:p-0">
        <header className="grid gap-1 border-b border-zinc-200 pb-4">
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">GigaFazt · {t("kind")}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title", { name: s.ident.name || s.ident.address || t("building") })}</h1>
          <p className="text-sm text-zinc-600">
            {[s.ident.address, s.ident.municipality].filter(Boolean).join(", ")} · {today}
          </p>
        </header>

        <section className="grid gap-2">
          <h2 className="text-base font-semibold">{t("buildingTitle")}</h2>
          <ul className="grid gap-1 text-sm text-zinc-700">
            {s.towers.length > 0 && <li>{t("towers", { n: s.towers.length })}</li>}
            {floors > 0 && <li>{t("floors", { n: floors })}</li>}
            {apartments > 0 && <li>{t("apartments", { n: apartments })}</li>}
          </ul>
        </section>

        <section className="grid gap-2">
          <h2 className="text-base font-semibold">{t("installTitle")}</h2>
          <ul className="list-disc gap-1 pl-5 text-sm text-zinc-700">
            <li>{t("install.feed")}</li>
            <li>{t("install.riser")}</li>
            {boxes > 0 ? <li>{t("install.boxes", { boxes, ports })}</li> : <li>{t("install.boxesTbd")}</li>}
            <li>{t("install.apartments")}</li>
            <li>{t("install.noCost")}</li>
          </ul>
        </section>

        <section className="grid gap-3">
          <h2 className="text-base font-semibold">{t("plansTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <div key={p.id} className="grid content-start gap-1 rounded-lg border border-zinc-200 p-4">
                <p className="text-lg font-semibold">{speedLabel(p.downMbps)}</p>
                <p className="text-xs text-zinc-500">{t("symmetric")}</p>
                <p className="mt-1 font-mono text-xl">{isPlaceholder(p.priceMxn) ? "—" : `$${formatMxn(p.priceMxn, "es")}`}</p>
                <p className="text-xs text-zinc-500">{t("perMonth")}</p>
                {Array.isArray(p.includes) && p.includes.map((inc) => <p key={inc} className="text-xs text-zinc-700">{tp(`include.${inc}`)}</p>)}
              </div>
            ))}
          </div>
          <ul className="grid gap-1 text-sm text-zinc-700">
            {plans.every((p) => p.installFeeMxn === 0) && <li>{t("terms.install")}</li>}
            {plans.every((p) => p.contractMonths === null) && <li>{t("terms.term")}</li>}
            {tv && !isPlaceholder(tv.priceMxn) && <li>{t("terms.tv", { price: formatMxn(tv.priceMxn, "es") })}</li>}
          </ul>
        </section>

        <footer className="grid gap-1 border-t border-zinc-200 pt-4 text-sm text-zinc-700">
          <p>{t("next")}</p>
          {wa && <p className="font-mono">{t("contact", { phone: wa })}</p>}
          <p className="text-xs text-zinc-500">{t("fine")}</p>
        </footer>
      </article>
    </div>
  )
}
