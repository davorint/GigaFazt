"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import { localToday } from "@/lib/clients/from-lead"
import { clientLabel } from "@/lib/clients/model"
import { addMonths } from "@/lib/payments/model"
import { funnelMonth, funnelMonths, type FunnelEvent, type FunnelMonth } from "@/lib/wispdavor/funnel"
import { SERIES_COLORS } from "./LineChart"
import { useWispData } from "./useWispData"

const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" })
const dayName = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "")
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : "—")

/** /interno/software/wispdavor/cobranza: the collections funnel per month and the last six months side by side. */
export function FunnelApp() {
  const t = useTranslations("wispdavor.cobranza")
  const d = useWispData()
  const [events, setEvents] = useState<FunnelEvent[] | null>(null)
  const [error, setError] = useState(false)
  const [month, setMonth] = useState("")
  const today = d.loaded ? localToday() : ""
  const months = useMemo(() => (today ? funnelMonths(today) : []), [today])
  useEffect(() => {
    if (!months.length) return
    void (async () => {
      try {
        const r = await fetch(`/api/interno/embudo?desde=${addMonths(months.at(-1) ?? "", -3)}-01`, { cache: "no-store" })
        if (!r.ok) throw new Error(String(r.status))
        setEvents(((await r.json()) as { events: FunnelEvent[] }).events)
      } catch {
        // Without the server: notices and suspensions unknown; the late and paid parts still work.
        setError(true)
        setEvents([])
      }
    })()
  }, [months])
  const all = useMemo(() => (events && d.loaded ? months.map((m) => funnelMonth(d.clients, d.payments, events, m, today)) : []), [events, d.loaded, d.clients, d.payments, months, today])
  if (!d.loaded) return null
  const pick = month || months[0] || ""
  const f = all.find((x) => x.month === pick)
  const name = (id: string) => {
    const c = d.clients.find((x) => x.id === id)
    return c ? clientLabel(c) : id
  }
  return (
    <div className="mt-6 grid gap-10">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {error && <p className="text-xs text-amber-200">{t("offline")}</p>}
      {!events && <p className="text-sm text-zinc-400">{t("loading")}</p>}
      {f && (
        <>
          <div className="max-w-xs">
            <PickField label={t("month")} value={pick} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthName(m) }))} />
          </div>
          <Funnel f={f} />
          <section aria-labelledby="fu-rows" className="grid gap-2">
            <h2 id="fu-rows" className="text-xl font-light text-foreground">
              {t("rowsTitle", { month: monthName(f.month) })}
            </h2>
            {!f.rows.length && <p className="text-sm text-zinc-400">{t("noneLate")}</p>}
            <ul className="grid gap-1.5">
              {[...f.rows]
                .sort((a, b) => Number(a.outcome !== "debe") - Number(b.outcome !== "debe") || (a.days ?? 999) - (b.days ?? 999))
                .map((r) => (
                  <li key={r.clientId} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
                    <a href={`/interno/admin/clientes?c=${r.clientId}`} className="text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-white">
                      {name(r.clientId)}
                    </a>
                    <span className={`font-mono text-xs ${r.outcome === "debe" ? "text-red-300" : r.outcome === "baja" ? "text-zinc-400" : "text-emerald-300"}`}>
                      {[r.notified ? t("tag.notified") : "", r.suspended ? t("tag.suspended") : "", t(`outcome.${r.outcome}`, { days: r.days ?? 0, date: dayName(r.paidDay) })].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          <Months all={all} />
        </>
      )}
    </div>
  )
}

/** The month's funnel as bars of one hue (counts; text in text colors, never the bar's). */
function Funnel({ f }: { f: FunnelMonth }) {
  const t = useTranslations("wispdavor.cobranza")
  const paid = f.paid.solo + f.paid.aviso + f.paid.suspension
  const steps: [string, number, string][] = [
    [t("step.late"), f.late, ""],
    [t("step.notified"), f.notified, pct(f.notified, f.late)],
    [t("step.suspended"), f.suspended, pct(f.suspended, f.late)],
    [t("step.paid"), paid, pct(paid, f.late)],
    [t("step.owing"), f.owing, pct(f.owing, f.late)],
  ]
  return (
    <section aria-labelledby="fu-steps" className="grid gap-3 rounded-2xl border border-white/10 p-4">
      <h2 id="fu-steps" className="text-lg font-light text-foreground">
        {t("funnelTitle", { day: dayName(f.lateDay) })}
      </h2>
      <ul className="grid gap-2">
        {steps.map(([label, n, share]) => (
          <li key={label} className="grid gap-1">
            <span className="flex items-baseline justify-between gap-2 text-sm text-zinc-200">
              <span>{label}</span>
              <span className="font-mono text-zinc-100">
                {n}
                {share ? <span className="text-zinc-400">{` · ${share}`}</span> : null}
              </span>
            </span>
            <span aria-hidden className="block h-2 rounded-full bg-white/5">
              <span className="block h-2 rounded-full" style={{ width: `${f.late ? Math.max(n ? 2 : 0, (n / f.late) * 100) : 0}%`, background: SERIES_COLORS[0] }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-zinc-300">{t("paidSplit", { solo: f.paid.solo, aviso: f.paid.aviso, suspension: f.paid.suspension, gone: f.gone })}</p>
      <p className="text-sm text-zinc-300">{f.medianDays === null ? t("noMedian") : t("median", { days: f.medianDays })}</p>
    </section>
  )
}

/** The last six months side by side (a table: the text equivalent and the comparison at once). */
function Months({ all }: { all: FunnelMonth[] }) {
  const t = useTranslations("wispdavor.cobranza")
  return (
    <section aria-labelledby="fu-months" className="grid gap-2">
      <h2 id="fu-months" className="text-xl font-light text-foreground">
        {t("monthsTitle")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm text-zinc-200">
          <thead>
            <tr className="text-xs text-zinc-400">
              <th className="py-2 pr-3 font-normal">{t("col.month")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("col.late")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("col.notified")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("col.suspended")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("col.recovered")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("col.owing")}</th>
              <th className="py-2 text-right font-normal">{t("col.median")}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {all.map((f) => {
              const paid = f.paid.solo + f.paid.aviso + f.paid.suspension
              return (
                <tr key={f.month} className="border-t border-white/5">
                  <td className="py-2 pr-3 font-sans">{monthName(f.month)}</td>
                  <td className="py-2 pr-3 text-right">{f.late}</td>
                  <td className="py-2 pr-3 text-right">{f.notified}</td>
                  <td className="py-2 pr-3 text-right">{f.suspended}</td>
                  <td className="py-2 pr-3 text-right">{`${paid} (${pct(paid, f.late)})`}</td>
                  <td className="py-2 pr-3 text-right">{f.owing}</td>
                  <td className="py-2 text-right">{f.medianDays === null ? "—" : f.medianDays}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
