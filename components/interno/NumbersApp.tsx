"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { paymentsStore } from "@/lib/payments/store"
import { reportsStore } from "@/lib/reports/store"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { lastMonths, monthNumbers, siteNumbers } from "@/lib/interno/numbers"
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-white/10 p-3">
      <span className="font-mono text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  )
}

/** /interno/admin/numeros: the last 12 months and the profit of each location, from the records on this phone. */
export function NumbersApp() {
  const t = useTranslations("numeros")
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  if (!clients.loaded || !payments.loaded || !reports.loaded || !sites.loaded) return null
  const months = lastMonths(localToday().slice(0, 7), MONTHS)
  const rows = monthNumbers(clients.list, payments.list, reports.list, months)
  const now = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const bySite = siteNumbers(sites.list, clients.list)
  const total = bySite.reduce((a, s) => a + s.profit, 0)
  return (
    <div className="mt-6 grid gap-8">
      <section aria-label={t("thisMonth")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("thisMonth")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t("cols.collected")} value={mxn(now.collected)} hint={t("ofExpected", { amount: mxn(now.expected), pct: pct(now.rate) })} />
          <Tile label={t("cols.active")} value={String(now.activeClients)} hint={t("change", { n: now.activeClients - prev.activeClients })} />
          <Tile label={t("cols.moves")} value={`+${now.newServices} / −${now.cancelled}`} hint={t("movesHint")} />
          <Tile label={t("cols.arpu")} value={now.arpu === null ? "—" : mxn(now.arpu)} hint={t("arpuHint")} />
        </div>
      </section>

      <section aria-label={t("monthly")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("monthly")}</h2>
        <p className="text-xs text-zinc-400">{t("monthlyHint")}</p>
        <div className="overflow-x-auto rounded-xl border border-white/10">
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
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>{t("cols.site")}</th>
                  <th className={`${TH} text-right`}>{t("cols.clients")}</th>
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
    </div>
  )
}
