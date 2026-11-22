"use client"

import { useState, useSyncExternalStore } from "react"
import { LineChart, SERIES_COLORS } from "@/components/wispdavor/LineChart"
import { forecast } from "@/lib/interno/outlook"
import { readState } from "@/lib/sync/state"
import { useTranslations } from "next-intl"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { paymentsStore } from "@/lib/payments/store"
import { reportsStore } from "@/lib/reports/store"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { cancelReasons, churnRate, clientsAtRisk, lastMonths, monthNumbers, siteNumbers } from "@/lib/interno/numbers"
import { payablesStore, receivablesStore } from "@/lib/finance/store"
import { agingTotals, balanceOf, isOpenDoc } from "@/lib/finance/common"
import { serviceReceivables } from "@/lib/finance/receivables"
import { agendaStore } from "@/lib/agenda/store"
import { isOpenAppt } from "@/lib/agenda/model"
import { hoursToSolve, isOpen as reportOpen } from "@/lib/reports/model"
import { clientLabel } from "@/lib/clients/model"
import { mxn } from "@/lib/materials/catalog"
import { localToday } from "@/lib/clients/from-lead"

const MONTHS = 12
const TH = "px-3 py-2 text-left font-mono text-[0.7rem] font-normal uppercase tracking-wide text-zinc-400"
const TD = "px-3 py-2 text-right font-mono tabular-nums text-zinc-100"

const monthName = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" })
}
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`)

function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-white/10 p-3">
      <span className="font-mono text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</span>
      <span className={`font-mono text-lg tabular-nums ${tone || "text-foreground"}`}>{value}</span>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  )
}

/** "+3", "−$1,200.00", "=": the change against last month. */
const delta = (n: number, money = false) => (Math.abs(n) < 0.005 ? "=" : `${n > 0 ? "+" : "−"}${money ? mxn(Math.abs(n)) : Math.abs(n)}`)

/** /interno/admin/numeros: the last 12 months and the profit of each location, from the records on this phone. */
export function NumbersApp() {
  const t = useTranslations("numeros")
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const payables = useSyncExternalStore(payablesStore.subscribe, payablesStore.snapshot, payablesStore.serverSnapshot)
  const receivables = useSyncExternalStore(receivablesStore.subscribe, receivablesStore.snapshot, receivablesStore.serverSnapshot)
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot)
  if (!clients.loaded || !payments.loaded || !reports.loaded || !sites.loaded || !payables.loaded || !receivables.loaded || !agenda.loaded) return null
  const today = localToday()
  const months = lastMonths(today.slice(0, 7), MONTHS)
  const rows = monthNumbers(clients.list, payments.list, reports.list, months)
  const now = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const bySite = siteNumbers(sites.list, clients.list)
  const total = bySite.reduce((a, s) => a + s.profit, 0)
  // ── The owner's dashboard: this month against the one before ──
  const inMonth = (m: string) => (d: string) => d.slice(0, 7) === m
  const cashIn = (m: string) =>
    payments.list.filter((p) => inMonth(m)(p.date)).reduce((a, p) => a + p.amount, 0) + receivables.list.reduce((a, x) => a + x.payments.filter((p) => inMonth(m)(p.date)).reduce((b, p) => b + p.amount, 0), 0)
  const cashOut = (m: string) => payables.list.reduce((a, x) => a + x.payments.filter((p) => inMonth(m)(p.date)).reduce((b, p) => b + p.amount, 0), 0)
  const inNow = cashIn(now.month)
  const inPrev = cashIn(prev.month)
  const outNow = cashOut(now.month)
  const outPrev = cashOut(prev.month)
  const churnNow = churnRate(rows, rows.length - 1)
  const churnPrev = churnRate(rows, rows.length - 2)
  const receivableOverdue = (() => {
    const a = agingTotals([...receivables.list.filter(isOpenDoc).map((x) => ({ due: x.dueDate, amount: balanceOf(x) })), ...serviceReceivables(clients.list, payments.list, today).map((s) => ({ due: s.lastDay, amount: s.amount }))], today)
    return a.d0_30 + a.d31_60 + a.d61_90 + a.d90
  })()
  const payableOverdue = payables.list.filter((x) => isOpenDoc(x) && x.dueDate && x.dueDate < today).reduce((a, x) => a + balanceOf(x), 0)
  const backlog = agenda.list.filter((a) => a.kind === "instalacion" && isOpenAppt(a)).length
  const openReports = reports.list.filter(reportOpen).length
  const last30 = Date.parse(`${today}T00:00:00Z`) - 30 * 864e5
  const solved = reports.list.filter((r) => r.status === "resuelto" && r.resolvedAt && Date.parse(r.resolvedAt) >= last30).map(hoursToSolve).filter((h): h is number => h !== null)
  const mttr = solved.length ? solved.reduce((a, b) => a + b, 0) / solved.length : null
  const reasons = cancelReasons(clients.list, months)
  const atRisk = clientsAtRisk(clients.list, payments.list, reports.list, today)
  const apartments = bySite.reduce((a, s) => a + s.apartments, 0)
  const activeInSites = bySite.reduce((a, s) => a + s.active, 0)
  return (
    <div className="mt-6 grid gap-8">
      <section aria-label={t("dash.title")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("dash.title")}</h2>
        <p className="text-xs text-zinc-400">{t("dash.hint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tile label={t("cols.active")} value={String(now.activeClients)} hint={t("dash.vsLast", { d: delta(now.activeClients - prev.activeClients) })} />
          <Tile label={t("cols.moves")} value={`+${now.newServices} / −${now.cancelled}`} hint={t("dash.vsLastMoves", { n: prev.newServices, c: prev.cancelled })} />
          <Tile label={t("dash.churn")} value={pct(churnNow)} hint={t("dash.vsLastText", { v: pct(churnPrev) })} tone={churnNow !== null && churnPrev !== null && churnNow > churnPrev ? "text-red-300" : ""} />
          <Tile label={t("dash.cashIn")} value={mxn(inNow)} hint={t("dash.vsLast", { d: delta(inNow - inPrev, true) })} />
          <Tile label={t("dash.cashOut")} value={mxn(outNow)} hint={t("dash.vsLast", { d: delta(outNow - outPrev, true) })} />
          <Tile label={t("dash.net")} value={mxn(inNow - outNow)} hint={t("dash.vsLast", { d: delta(inNow - outNow - (inPrev - outPrev), true) })} tone={inNow - outNow < 0 ? "text-red-300" : "text-emerald-300"} />
          <Tile label={t("dash.receivableOverdue")} value={mxn(receivableOverdue)} tone={receivableOverdue > 0 ? "text-red-300" : ""} />
          <Tile label={t("dash.payableOverdue")} value={mxn(payableOverdue)} tone={payableOverdue > 0 ? "text-red-300" : ""} />
          <Tile label={t("dash.backlog")} value={String(backlog)} hint={t("dash.backlogHint")} />
          <Tile label={t("dash.reports")} value={String(openReports)} hint={mttr === null ? t("dash.noMttr") : t("dash.mttr", { h: Math.round(mttr) })} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t("cols.collected")} value={mxn(now.collected)} hint={t("ofExpected", { amount: mxn(now.expected), pct: pct(now.rate) })} />
          <Tile label={t("cols.arpu")} value={now.arpu === null ? "—" : mxn(now.arpu)} hint={t("arpuHint")} />
          <Tile label={t("dash.penetration")} value={apartments ? pct(activeInSites / apartments) : "—"} hint={t("dash.penetrationHint", { active: activeInSites, apartments })} />
          <Tile label={t("dash.atRisk")} value={String(atRisk.length)} hint={t("dash.atRiskHint")} tone={atRisk.length ? "text-amber-200" : ""} />
        </div>
      </section>

      <Outlook rows={rows} clients={clients.list} />

      <section aria-label={t("monthly")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("monthly")}</h2>
        <p className="text-xs text-zinc-400">{t("monthlyHint")}</p>
        <div tabIndex={0} role="region" aria-label={t("monthly")} className="overflow-x-auto rounded-xl border border-white/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-white/10">
              <tr>
                <th className={TH}>{t("cols.month")}</th>
                <th className={`${TH} text-right`}>{t("cols.expected")}</th>
                <th className={`${TH} text-right`}>{t("cols.collected")}</th>
                <th className={`${TH} text-right`}>{t("cols.rate")}</th>
                <th className={`${TH} text-right`}>{t("cols.new")}</th>
                <th className={`${TH} text-right`}>{t("cols.cancelled")}</th>
                <th className={`${TH} text-right`}>{t("cols.active")}</th>
                <th className={`${TH} text-right`}>{t("cols.arpu")}</th>
                <th className={`${TH} text-right`}>{t("cols.reports")}</th>
                <th className={`${TH} text-right`}>{t("cols.hours")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 font-mono text-zinc-300">{monthName(r.month)}</td>
                  <td className={TD}>{mxn(r.expected)}</td>
                  <td className={TD}>{mxn(r.collected)}</td>
                  <td className={TD}>{pct(r.rate)}</td>
                  <td className={TD}>{r.newServices}</td>
                  <td className={TD}>{r.cancelled}</td>
                  <td className={TD}>{r.activeClients}</td>
                  <td className={TD}>{r.arpu === null ? "—" : mxn(r.arpu)}</td>
                  <td className={TD}>
                    {r.reportsOpened} / {r.reportsResolved}
                  </td>
                  <td className={TD}>{r.avgHours === null ? "—" : Math.round(r.avgHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label={t("sites")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("sites")}</h2>
        <p className="text-xs text-zinc-400">{t("sitesHint", { total: mxn(total) })}</p>
        {!bySite.length ? (
          <p className="text-sm text-zinc-400">{t("noSites")}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={t("sites")} className="overflow-x-auto rounded-xl border border-white/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>{t("cols.site")}</th>
                  <th className={`${TH} text-right`}>{t("cols.clients")}</th>
                  <th className={`${TH} text-right`}>{t("cols.penetration")}</th>
                  <th className={`${TH} text-right`}>{t("cols.income")}</th>
                  <th className={`${TH} text-right`}>{t("cols.building")}</th>
                  <th className={`${TH} text-right`}>{t("cols.links")}</th>
                  <th className={`${TH} text-right`}>{t("cols.profit")}</th>
                </tr>
              </thead>
              <tbody>
                {bySite.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-zinc-100">
                      <a href={`/interno/admin/despliegues?d=${s.id}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                        {s.name}
                      </a>
                      {s.unpricedLinks > 0 && <span className="ml-2 text-xs text-amber-200">{t("unpriced", { n: s.unpricedLinks })}</span>}
                    </td>
                    <td className={TD}>{s.clients}</td>
                    <td className={`${TD} ${s.penetration !== null && s.penetration < 0.3 ? "text-amber-200" : ""}`}>{s.penetration === null ? "—" : `${pct(s.penetration)} · ${s.active}/${s.apartments}`}</td>
                    <td className={TD}>{mxn(s.income)}</td>
                    <td className={TD}>{mxn(s.building)}</td>
                    <td className={TD}>{mxn(s.links)}</td>
                    <td className={`${TD} ${s.profit < 0 ? "text-red-300" : "text-emerald-300"}`}>{mxn(s.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label={t("risk.title")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("risk.title")}</h2>
        <p className="text-xs text-zinc-400">{t("risk.hint")}</p>
        {!atRisk.length && <p className="text-sm text-zinc-400">{t("risk.none")}</p>}
        <ul className="grid gap-2">
          {atRisk.slice(0, 40).map((r) => (
            <li key={r.client.id}>
              <a href={`/interno/admin/clientes?c=${r.client.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 p-3 hover:bg-white/[0.03]">
                <span className="text-sm text-zinc-100">{clientLabel(r.client)}</span>
                <span className="text-xs text-amber-200">
                  {r.reasons.map((x) => t(`risk.reasons.${x}`)).join(" · ")}
                  {r.owed > 0 ? ` · ${t("risk.owes", { amount: mxn(r.owed) })}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t("churn.title")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("churn.title")}</h2>
        <p className="text-xs text-zinc-400">{t("churn.hint")}</p>
        {!reasons.length ? (
          <p className="text-sm text-zinc-400">{t("churn.none")}</p>
        ) : (
          <ul className="grid gap-1">
            {reasons.map((r) => (
              <li key={r.reason || "none"} className="flex justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm">
                <span className="text-zinc-100">{t(`churn.reasons.${r.reason || "none"}`)}</span>
                <span className="font-mono text-zinc-300">{r.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * Phase 10: the next months' billing (an estimate: current clients at their dated prices, and the same with the average
 * churn of the last 3 months), three 12-month trends and the weekly summary on demand.
 */
function Outlook({ rows, clients }: { rows: ReturnType<typeof monthNumbers>; clients: Parameters<typeof forecast>[0] }) {
  const t = useTranslations("numeros.outlook")
  const [msg, setMsg] = useState("")
  const f = forecast(clients, rows, rows[rows.length - 1].month)
  const times = rows.map((r) => `${r.month}-15T12:00:00`)
  const when = (x: string) => monthName(x.slice(0, 7))
  const churn = rows.map((_, i) => {
    const c = churnRate(rows, i)
    return c === null ? null : Math.round(c * 1000) / 10
  })
  const send = async () => {
    setMsg(t("sending"))
    try {
      const r = await fetch("/api/interno/semanal", { method: "POST", headers: { "x-interno-nombre": encodeURIComponent(readState().name) } })
      const b = (await r.json()) as { sent?: boolean; reason?: string }
      setMsg(b.sent ? t("sent") : t(b.reason === "no-channel" ? "noChannel" : "failed"))
    } catch {
      setMsg(t("failed"))
    }
  }
  return (
    <section aria-label={t("title")} className="grid gap-3">
      <h2 className="text-base font-medium text-foreground">{t("title")}</h2>
      <p className="text-xs text-zinc-400">
        <span className="mr-2 rounded border border-amber-300/40 px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide text-amber-200">{t("tag")}</span>
        {t("hint", { churn: pct(f.churn) })}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {f.rows.map((r) => (
          <Tile key={r.month} label={monthName(r.month)} value={mxn(r.withChurn)} hint={t("scheduled", { amount: mxn(r.scheduled) })} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-1">
          <h3 className="text-sm text-zinc-200">{t("charts.clients")}</h3>
          <LineChart times={times} when={when} series={[{ label: t("charts.clients"), color: SERIES_COLORS[0], values: rows.map((r) => r.activeClients) }]} label={t("charts.clients")} unit="" fmt={(n) => String(Math.round(n))} />
        </div>
        <div className="grid gap-1">
          <h3 className="text-sm text-zinc-200">{t("charts.money")}</h3>
          <LineChart
            times={times}
            when={when}
            series={[
              { label: t("charts.expected"), color: SERIES_COLORS[0], values: rows.map((r) => r.expected) },
              { label: t("charts.collected"), color: SERIES_COLORS[1], values: rows.map((r) => r.collected) },
            ]}
            label={t("charts.money")}
            unit="MXN"
            fmt={mxn}
          />
        </div>
        <div className="grid gap-1">
          <h3 className="text-sm text-zinc-200">{t("charts.churn")}</h3>
          <LineChart times={times} when={when} series={[{ label: t("charts.churn"), color: SERIES_COLORS[2], values: churn }]} label={t("charts.churn")} unit="%" fmt={(n) => `${n.toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`} />
        </div>
      </div>
      <p className="text-xs text-zinc-400">{t("tableNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void send()} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5">
          {t("weekly")}
        </button>
        {msg && (
          <p role="status" className="text-xs text-zinc-200">
            {msg}
          </p>
        )}
      </div>
      <p className="text-xs text-zinc-400">{t("weeklyHint")}</p>
    </section>
  )
}
