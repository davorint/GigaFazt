"use client"

import { useId, useState, useSyncExternalStore, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { localToday } from "@/lib/clients/from-lead"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { searchAll, SEARCH_KINDS, type Hit } from "@/lib/interno/search"
import { SERIOUS, allClear, todaySummary } from "@/lib/interno/today"
import { mxn } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { notesStore } from "@/lib/notes/store"
import { payablesStore, receivablesStore } from "@/lib/finance/store"
import { paymentsStore } from "@/lib/payments/store"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { reportsStore } from "@/lib/reports/store"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"
import { subscribeSync, syncServerSnapshot, syncSnapshot } from "@/lib/sync/engine"
import { subscribeTools, toolsServerSnapshot, toolsSnapshot } from "@/lib/tools/store"

const A = "/interno/admin"
const LINK = "text-sm text-zinc-100 underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none rounded"
const SMALL =
  "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

function useData() {
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const tools = useSyncExternalStore(subscribeTools, toolsSnapshot, toolsServerSnapshot).list
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list
  const items = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot).items
  const surveys = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot).list
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot).list
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot).list
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.snapshot, notesStore.serverSnapshot).list
  const payables = useSyncExternalStore(payablesStore.subscribe, payablesStore.snapshot, payablesStore.serverSnapshot).list
  const receivables = useSyncExternalStore(receivablesStore.subscribe, receivablesStore.snapshot, receivablesStore.serverSnapshot).list
  return { loaded: clients.loaded, clients: clients.list, sites, tools, providers, items, surveys, reports, payments, moves, units, notes, payables, receivables }
}

/** One card per thing that needs attention; nothing when its count is 0 (those go in the "En orden" line). */
function Card({ title, href, open, count, tone, children }: { title: string; href: string; open: string; count: number; tone: "red" | "amber" | "ok"; children?: ReactNode }) {
  if (!count) return null
  const color = tone === "red" ? "border-red-400/40" : tone === "amber" ? "border-amber-400/40" : "border-white/10"
  return (
    <section className={`grid content-start gap-2 rounded-xl border p-4 ${color}`}>
      <h3 className="flex items-baseline justify-between gap-3 text-sm font-medium text-foreground">
        <span>{title}</span>
        <span className={`font-mono text-2xl ${tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-200" : "text-zinc-400"}`}>{count}</span>
      </h3>
      {children}
      <a href={href} className="mt-1 font-mono text-xs text-zinc-400 hover:text-zinc-100">
        {open} →
      </a>
    </section>
  )
}

/** "Enviar resumen al chat": the daily summary now (it also goes every morning when the host has the cron set). */
function SendDigest() {
  const t = useTranslations("interno.today.digest")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "clear" | "off" | "error">("idle")
  const send = async () => {
    setState("sending")
    try {
      const r = await fetch("/api/interno/resumen", { method: "POST" })
      const j = (await r.json()) as { ok?: boolean; sent?: boolean; error?: string }
      setState(j.error === "not-configured" ? "off" : !r.ok || !j.ok ? "error" : j.sent ? "sent" : "clear")
    } catch {
      setState("error")
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void send()} disabled={state === "sending"} className={SMALL}>
        {state === "sending" ? t("sending") : t("send")}
      </button>
      {state !== "idle" && state !== "sending" && (
        <span role="status" className={`text-xs ${state === "sent" || state === "clear" ? "text-emerald-300" : "text-amber-200"}`}>
          {t(state)}
        </span>
      )}
    </div>
  )
}

/** The top of /interno: search everything, what needs attention today, and this phone's session. */
export function TodayBoard() {
  const t = useTranslations("interno.today")
  const d = useData()
  const sync = useSyncExternalStore(subscribeSync, syncSnapshot, syncServerSnapshot)
  const [q, setQ] = useState("")
  const searchId = useId()
  if (!d.loaded) return null
  const today = localToday()
  const s = todaySummary(d, today)
  const hits = searchAll(d, q)
  const list = (xs: { key: string; text: string; href?: string }[], more: number) => (
    <ul className="grid gap-1">
      {xs.map((x) => (
        <li key={x.key} className="text-sm text-zinc-300">
          {x.href ? (
            <a href={x.href} className={LINK}>
              {x.text}
            </a>
          ) : (
            x.text
          )}
        </li>
      ))}
      {more > 0 && <li className="text-xs text-zinc-400">{t("more", { n: more })}</li>}
    </ul>
  )
  const quiet = [
    [t("reports.title"), s.reports.open],
    [t("payments.title"), s.payments.late.length],
    [t("tools.title"), s.tools.length],
    [t("stock.title"), s.lowStock.length],
    [t("notes.title"), s.pinned.length],
    [t("bills.title"), s.bills.length],
    [t("charges.title"), s.charges.length],
    [t("complements.title"), s.complements.length],
    [t("agreements.title"), s.agreements.length],
  ]
    .filter(([, n]) => !n)
    .map(([label]) => String(label))
  const serious = s.tools.filter((x) => x.alerts.some((a) => SERIOUS.includes(a))).length
  return (
    <div className="mt-8 grid gap-8">
      <section aria-labelledby={`${searchId}-h`} className="grid gap-3">
        <h2 id={`${searchId}-h`} className="text-lg font-medium text-foreground">
          {t("search.title")}
        </h2>
        <Input
          type="search"
          aria-label={t("search.title")}
          placeholder={t("search.placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 bg-white/[0.03] text-base md:text-sm"
        />
        {q.trim().length >= 2 && (
          <div aria-live="polite" className="grid gap-3">
            {!hits.length && <p className="text-sm text-zinc-400">{t("search.none")}</p>}
            {SEARCH_KINDS.filter((k) => hits.some((h) => h.kind === k)).map((k) => (
              <div key={k} className="grid gap-1.5">
                <h3 className="font-mono text-xs tracking-wide text-zinc-400 uppercase">{t(`search.kinds.${k}`)}</h3>
                <ul className="grid gap-1">
                  {hits
                    .filter((h: Hit) => h.kind === k)
                    .map((h) => (
                      <li key={h.id}>
                        <a href={h.href} className="grid rounded-lg border border-white/10 px-3 py-2 hover:bg-white/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                          <span className="text-sm text-zinc-100">{h.label}</span>
                          {h.detail && <span className="text-xs text-zinc-400">{h.detail}</span>}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby={`${searchId}-today`} className="grid gap-3">
        <h2 id={`${searchId}-today`} className="text-lg font-medium text-foreground">
          {t("title")}
        </h2>
        <SendDigest />
        <p className="text-xs text-zinc-400">{sync.lastOk ? t("asOf", { date: new Date(sync.lastOk).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("notSynced")}</p>
        {allClear(s) ? (
          <p className="rounded-xl border border-emerald-400/30 p-4 text-sm text-emerald-200">{t("allClear")}</p>
        ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card title={t("reports.title")} href={`${A}/reportes_clientes`} open={t("open")} count={s.reports.open} tone={s.reports.fresh.length || s.reports.urgent ? "red" : s.reports.open ? "amber" : "ok"}>
              <p className="text-xs text-zinc-300">{t("reports.line", { fresh: s.reports.fresh.length, urgent: s.reports.urgent, stale: s.reports.stale })}</p>
              {list(
                s.reports.fresh.slice(0, 4).map((r) => ({ key: r.id, text: r.label, href: `${A}/reportes_clientes?r=${r.id}` })),
                s.reports.fresh.length - 4
              )}
            </Card>
            <Card title={t("payments.title")} href={`${A}/clientes?tab=payments`} open={t("open")} count={s.payments.late.length} tone={s.payments.late.length ? "amber" : "ok"}>
              {s.payments.late.length > 0 && <p className="text-xs text-zinc-300">{t("payments.line", { amount: mxn(s.payments.lateAmount) })}</p>}
              {list(
                s.payments.late.slice(0, 4).map((c) => ({ key: c.id, text: `${c.label} · ${mxn(c.owed)}`, href: `${A}/clientes?c=${c.id}` })),
                s.payments.late.length - 4
              )}
            </Card>
            <Card title={t("tools.title")} href={`${A}/herramientas?show=atencion`} open={t("open")} count={s.tools.length} tone={serious ? "red" : s.tools.length ? "amber" : "ok"}>
              {list(
                s.tools.slice(0, 4).map((x) => ({ key: x.id, text: `${x.label} · ${x.alerts.map((a) => t(`tools.alerts.${a}`)).join(", ")}`, href: `${A}/herramientas?h=${x.id}` })),
                s.tools.length - 4
              )}
            </Card>
            <Card title={t("stock.title")} href={`${A}/materiales?t=existencias`} open={t("open")} count={s.lowStock.length} tone={s.lowStock.length ? "amber" : "ok"}>
              {list(
                s.lowStock.slice(0, 4).map((x) => ({ key: x.id, text: t("stock.line", { name: x.name, has: x.has, min: x.min, unit: x.unit }) })),
                s.lowStock.length - 4
              )}
            </Card>
            <Card title={t("bills.title")} href={`${A}/cuentas-por-pagar`} open={t("open")} count={s.bills.length} tone={s.bills.some((b) => b.late) ? "red" : s.bills.length ? "amber" : "ok"}>
              {list(
                s.bills.slice(0, 4).map((b) => ({ key: b.id, text: t(b.late ? "bills.late" : "bills.soon", { label: b.label, amount: mxn(b.balance), date: b.due }), href: `${A}/cuentas-por-pagar?p=${b.id}` })),
                s.bills.length - 4
              )}
            </Card>
            <Card title={t("charges.title")} href={`${A}/cuentas-por-cobrar`} open={t("open")} count={s.charges.length} tone={s.charges.length ? "amber" : "ok"}>
              {list(
                s.charges.slice(0, 4).map((c) => ({ key: c.id, text: t("charges.line", { label: c.label, amount: mxn(c.balance), date: c.due }), href: `${A}/cuentas-por-cobrar?c=${c.id}` })),
                s.charges.length - 4
              )}
            </Card>
            <Card title={t("complements.title")} href={`${A}/cuentas-por-cobrar`} open={t("open")} count={s.complements.length} tone={s.complements.some((c) => c.deadline < today) ? "red" : s.complements.length ? "amber" : "ok"}>
              {list(
                s.complements.slice(0, 4).map((c) => ({ key: `${c.side}-${c.id}`, text: t(`complements.${c.side}`, { label: c.label, date: c.deadline }), href: `${A}/${c.side === "cobrar" ? "cuentas-por-cobrar?c=" : "cuentas-por-pagar?p="}${c.id}` })),
                s.complements.length - 4
              )}
            </Card>
            <Card title={t("agreements.title")} href={`${A}/acuerdos`} open={t("open")} count={s.agreements.length} tone={s.agreements.some((a) => a.ended) ? "red" : s.agreements.length ? "amber" : "ok"}>
              {list(
                s.agreements.slice(0, 4).map((a) => ({ key: a.id, text: t(a.ended ? "agreements.ended" : "agreements.soon", { label: a.label, date: a.end }), href: `${A}/despliegues?d=${a.id}` })),
                s.agreements.length - 4
              )}
            </Card>
            <Card title={t("notes.title")} href={`${A}/notas`} open={t("open")} count={s.pinned.length} tone={s.pinned.length ? "amber" : "ok"}>
              {list(
                s.pinned.slice(0, 4).map((n) => ({ key: n.id, text: n.title })),
                s.pinned.length - 4
              )}
            </Card>
          </div>
          {quiet.length > 0 && <p className="text-xs text-emerald-300">{t("quiet", { list: quiet.join(" · ") })}</p>}
          </>
        )}
      </section>
    </div>
  )
}

/**
 * Backup and leaving: the full backup from the database, and "Salir y borrar los datos de este teléfono" (a lost
 * phone, a technician who leaves): it removes everything the internal tools saved in this browser, then signs out.
 * Changes not sent yet are lost, so it says how many first.
 */
export function SessionActions() {
  const t = useTranslations("interno.session")
  const sync = useSyncExternalStore(subscribeSync, syncSnapshot, syncServerSnapshot)
  const wipe = () => {
    const ask = sync.pending ? t("confirmWipePending", { n: sync.pending }) : t("confirmWipe")
    if (!window.confirm(ask)) return
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith("gigafazt-")) window.localStorage.removeItem(k)
    } catch {
      // Storage blocked: nothing saved here to remove.
    }
    const f = document.createElement("form")
    f.method = "post"
    f.action = "/api/interno/salir?borrar=1"
    document.body.append(f)
    f.submit()
  }
  return (
    <section aria-label={t("title")} className="grid gap-3 rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-medium text-foreground">{t("title")}</h2>
      <div className="flex flex-wrap gap-2">
        <a href="/api/interno/respaldo" download className={SMALL}>
          {t("backup")}
        </a>
        <button type="button" onClick={wipe} className="inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {t("wipe")}
        </button>
      </div>
      <p className="text-xs text-zinc-400">{t("hint")}</p>
    </section>
  )
}
