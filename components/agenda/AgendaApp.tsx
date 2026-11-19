"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { ClientPick } from "@/components/clients/ClientPick"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { APPT_STATUSES, addDays, byWhen, isOpenAppt, weekOf, type Appointment, type ApptStatus } from "@/lib/agenda/model"
import { agendaStore } from "@/lib/agenda/store"
import { reportsStore } from "@/lib/reports/store"
import { isOpen as reportOpen, reportCode } from "@/lib/reports/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { clientLabel } from "@/lib/clients/model"
import { localToday } from "@/lib/clients/from-lead"
import { whatsappHref } from "@/lib/contact"
import { ScheduleForm, TimeField, WhoField, useTechnicians } from "./ScheduleForm"

type T = ReturnType<typeof useTranslations>
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const LINK = "inline-flex min-h-9 w-fit items-center text-xs text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white"
const TONE: Record<ApptStatus, string> = {
  pendiente: "border-amber-400/40 text-amber-200",
  confirmada: "border-cyan-400/40 text-cyan-200",
  hecha: "border-emerald-400/40 text-emerald-300",
  cancelada: "border-white/15 text-zinc-500 line-through",
}

/** "lunes 23 de noviembre". */
export const dayLabel = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "")

/** The WhatsApp digits of a phone: 10 digits get Mexico's 52. */
export const waDigits = (phone: string) => {
  const d = phone.replace(/\D/g, "")
  return d.length === 10 ? `52${d}` : d
}

/** The confirmation message for an appointment. */
export function confirmText(t: T, a: Appointment) {
  return t("wa.confirm", { kind: t(`kinds.${a.kind}`).toLowerCase(), date: dayLabel(a.date), time: a.time ? t("wa.at", { time: a.time }) : "", name: a.name.split(" ")[0] || "" })
}

type ReportVisit = { id: string; code: string; name: string; who: string; address: string }
type Row = { key: string; date: string; time: string; appt?: Appointment; report?: ReportVisit }

/** /interno/admin/agenda: the week's installations and visits, by day, with the reports' visits beside them. */
export function AgendaApp() {
  const t = useTranslations("agenda")
  const store = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot).list
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const names = useTechnicians()
  const today = localToday()
  const [day, setDay] = useState(today)
  const [who, setWho] = useState("")
  const [adding, setAdding] = useState(false)
  const [clientId, setClientId] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  if (!store.loaded) return null
  const week = weekOf(day)
  const mine = (w: string) => !who || (who === "-" ? !w.trim() : w.trim() === who)
  const rows: Row[] = [
    ...store.list.filter((a) => week.includes(a.date) && mine(a.who)).map((a): Row => ({ key: a.id, date: a.date, time: a.time, appt: a })),
    // Reports with a visit scheduled (status "visita"): shown here, edited in Reportes.
    ...reports
      .filter((r) => r.status === "visita" && week.includes(r.visitDate) && reportOpen(r) && mine(r.assignee))
      .map((r): Row => ({ key: `r-${r.id}`, date: r.visitDate, time: "", report: { id: r.id, code: reportCode(r), name: r.name || clients.find((c) => c.id === r.clientId)?.name || "", who: r.assignee, address: r.address } })),
  ].sort(byWhen)
  const late = store.list.filter((a) => isOpenAppt(a) && a.date && a.date < today && mine(a.who)).sort(byWhen)
  const client = clients.find((c) => c.id === clientId)

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -7))} className={SMALL}>
          {t("prev")}
        </button>
        <button type="button" onClick={() => setDay(today)} className={SMALL}>
          {t("thisWeek")}
        </button>
        <button type="button" onClick={() => setDay(addDays(day, 7))} className={SMALL}>
          {t("next")}
        </button>
        <div className="min-w-48">
          <PickField label={t("who")} value={who} onChange={setWho} options={[{ value: "", label: t("everyone") }, { value: "-", label: t("unassigned") }, ...names.map((n) => ({ value: n, label: n }))]} />
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className="h-10 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {t("add")}
        </button>
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("weekOf", { from: dayLabel(week[0]), to: dayLabel(week[6]) })}</p>

      {adding && (
        <div className="grid gap-3">
          <ClientPick label={t("form.client")} searchLabel={t("form.clientSearch")} searchHint={t("form.clientHint")} noneLabel={t("form.noClient")} value={clientId} onChange={setClientId} />
          <ScheduleForm
            key={clientId}
            kind="visita"
            base={client ? { clientId: client.id, siteId: client.siteId, name: clientLabel(client), phone: client.whatsapp || client.phone, address: [client.building, client.tower, client.apartment].filter(Boolean).join(" ") } : {}}
            onDone={(a) => {
              setAdding(false)
              setClientId("")
              if (a) {
                setDay(a.date)
                setOpenId(a.id)
              }
            }}
          />
        </div>
      )}

      {late.length > 0 && (
        <section aria-label={t("late")} className="grid gap-2 rounded-xl border border-amber-400/30 p-3">
          <h2 className="text-sm font-medium text-amber-100">{t("lateTitle", { n: late.length })}</h2>
          <ul className="grid gap-2">
            {late.map((a) => (
              <li key={a.id}>
                <ApptRow t={t} a={a} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} showDate />
              </li>
            ))}
          </ul>
        </section>
      )}

      {week.map((d) => {
        const items = rows.filter((r) => r.date === d)
        return (
          <section key={d} aria-label={dayLabel(d)} className="grid gap-2">
            <h2 className={`text-sm font-medium first-letter:uppercase ${d === today ? "text-cyan-200" : "text-foreground"}`}>
              {dayLabel(d)}
              {d === today ? ` · ${t("today")}` : ""}
            </h2>
            {!items.length ? (
              <p className="text-xs text-zinc-500">{t("free")}</p>
            ) : (
              <ul className="grid gap-2">
                {items.map((r) => (
                  <li key={r.key}>
                    {r.appt ? (
                      <ApptRow t={t} a={r.appt} open={openId === r.appt.id} onToggle={() => setOpenId(openId === r.appt?.id ? null : (r.appt?.id ?? null))} />
                    ) : r.report ? (
                      <VisitRow t={t} v={r.report} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** A report's visit: shown in the agenda, edited in Reportes. */
function VisitRow({ t, v }: { t: T; v: ReportVisit }) {
  return (
    <a href={`/interno/admin/reportes_clientes?r=${v.id}`} className="grid gap-0.5 rounded-xl border border-white/10 p-3 hover:bg-white/[0.03]">
      <span className="text-sm text-zinc-100">
        {t("reportVisit", { code: v.code })} · {v.name || "—"}
      </span>
      <span className="font-mono text-xs text-zinc-400">{[v.address, v.who || t("unassigned")].filter(Boolean).join(" · ")}</span>
    </a>
  )
}

function ApptRow({ t, a, open, onToggle, showDate }: { t: T; a: Appointment; open: boolean; onToggle: () => void; showDate?: boolean }) {
  const up = (p: Partial<Appointment>) => agendaStore.save({ ...a, ...p, updatedAt: new Date().toISOString() })
  const wa = waDigits(a.phone)
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{[showDate ? dayLabel(a.date) : "", a.time || t("anyTime"), t(`kinds.${a.kind}`), a.name || "—"].filter(Boolean).join(" · ")}</span>
          <span className="font-mono text-xs text-zinc-400">{[a.address, a.who || t("unassigned")].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${TONE[a.status]}`}>{t(`statuses.${a.status}`)}</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-white/10 p-3">
          <div className={GRID}>
            <PickField label={t("form.status")} value={a.status} onChange={(status: ApptStatus) => up({ status })} options={APPT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
            <DateField label={t("form.date")} value={a.date} onChange={(date) => up({ date })} />
            <TimeField label={t("form.time")} value={a.time} onChange={(time) => up({ time })} />
            <WhoField label={t("form.who")} value={a.who} onChange={(w) => up({ who: w.slice(0, 60) })} />
          </div>
          <AreaField label={t("form.notes")} value={a.notes} onChange={(notes) => up({ notes })} rows={2} />
          <div className="flex flex-wrap gap-2">
            {wa && (
              <a href={whatsappHref(wa, confirmText(t, a))} target="_blank" rel="noopener noreferrer" className={SMALL}>
                {t("confirmWa")}
              </a>
            )}
            {a.phone && (
              <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className={SMALL}>
                {t("call")}
              </a>
            )}
            {a.clientId && (
              <a href={`/interno/admin/clientes?c=${a.clientId}`} className={LINK}>
                {t("openClient")}
              </a>
            )}
            {a.reportId && (
              <a href={`/interno/admin/reportes_clientes?r=${a.reportId}`} className={LINK}>
                {t("openReport")}
              </a>
            )}
            {a.leadId && !a.clientId && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load
              <a href="/interno/admin/clientes?tab=leads" className={LINK}>
                {t("openLead")}
              </a>
            )}
          </div>
          <RecordHistory kind="agenda" id={a.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove")) && agendaStore.remove(a.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
