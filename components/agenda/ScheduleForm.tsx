"use client"

import { useId, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { APPT_KINDS, newAppointment, type ApptKind, type Appointment } from "@/lib/agenda/model"
import { agendaStore } from "@/lib/agenda/store"
import { reportsStore } from "@/lib/reports/store"
import { localToday } from "@/lib/clients/from-lead"
import { readState } from "@/lib/sync/state"

const PRIMARY = "h-10 w-fit rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const INPUT = "h-10 rounded-md border border-input bg-white/[0.03] px-2.5 font-mono text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [color-scheme:dark]"

/** The technicians to suggest: everyone already in the agenda or assigned a report, and this phone's name. */
export function useTechnicians(): string[] {
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot).list
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot).list
  const me = typeof window === "undefined" ? "" : readState().name
  return [...new Set([me, ...agenda.map((a) => a.who), ...reports.map((r) => r.assignee)].map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))
}

/** "HH:MM" picker (the phone's own time keyboard). */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <input id={id} type="time" step={900} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </div>
  )
}

/** Technician: typed, with the known names suggested. */
export function WhoField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  const names = useTechnicians()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <input id={id} list={`${id}-l`} value={value} maxLength={60} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      <datalist id={`${id}-l`}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}

/**
 * Schedules an installation or a visit: date, time, technician, notes. `base` carries who it's for (client, request,
 * report) and their contact; `onDone` gets the saved appointment.
 */
export function ScheduleForm({ base, kind: initialKind = "instalacion", fixedKind, onDone }: { base: Partial<Appointment>; kind?: ApptKind; fixedKind?: boolean; onDone: (a: Appointment | null) => void }) {
  const t = useTranslations("agenda")
  const [kind, setKind] = useState<ApptKind>(initialKind)
  const [date, setDate] = useState(base.date || localToday())
  const [time, setTime] = useState(base.time ?? "")
  const [who, setWho] = useState(base.who ?? "")
  const [notes, setNotes] = useState(base.notes ?? "")
  const [error, setError] = useState("")
  const save = () => {
    if (!date) return setError(t("form.needDate"))
    const a = newAppointment({ ...base, kind, date, time, who: who.trim(), notes: notes.trim(), by: readState().name, updatedAt: new Date().toISOString() })
    agendaStore.save(a)
    onDone(a)
  }
  return (
    <div className="grid gap-3 rounded-xl border border-white/15 p-3">
      <div className={GRID}>
        {!fixedKind && <PickField label={t("form.kind")} value={kind} onChange={setKind} options={APPT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />}
        <DateField label={t("form.date")} value={date} onChange={setDate} />
        <TimeField label={t("form.time")} value={time} onChange={setTime} />
        <WhoField label={t("form.who")} value={who} onChange={setWho} />
      </div>
      <AreaField label={t("form.notes")} value={notes} onChange={setNotes} rows={2} />
      {error && (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className={PRIMARY}>
          {t("form.save")}
        </button>
        <button type="button" onClick={() => onDone(null)} className={SMALL}>
          {t("form.cancel")}
        </button>
      </div>
    </div>
  )
}
