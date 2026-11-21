"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { MoveForm } from "@/components/materials/MoveForm"
import { AreaField, DateField, PickField } from "@/components/surveys/SurveyFields"
import { TextField } from "@/components/mikrotik/TextField"
import { useTechnicians } from "@/components/agenda/ScheduleForm"
import { addDays, byWhen, type Appointment } from "@/lib/agenda/model"
import { agendaStore } from "@/lib/agenda/store"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { localToday } from "@/lib/clients/from-lead"
import { whatsappHref } from "@/lib/contact"
import { MAX_FIELD_BYTES, MAX_FIELD_FILES, type FieldFile, type FieldWork, type JobRef } from "@/lib/field/model"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { reportCode, type Report } from "@/lib/reports/model"
import { reportsStore } from "@/lib/reports/store"
import { readState } from "@/lib/sync/state"
import { SignaturePad } from "./SignaturePad"

const BTN = "inline-flex min-h-11 w-fit items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
const PRIMARY = "inline-flex min-h-11 w-fit items-center rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
const MAX_SIDE = 2000

type Job =
  | { kind: "agenda"; ref: JobRef; time: string; who: string; done: boolean; rec: Appointment }
  | { kind: "reporte"; ref: JobRef; time: string; who: string; done: boolean; rec: Report }

const fold = (s: string) => s.trim().toLocaleLowerCase("es")
const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" }) : "")

/** A photo redrawn smaller as JPEG on the phone (field photos don't need full resolution; the host takes 4.5 MB). */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size <= MAX_FIELD_BYTES) return blob
    }
  } catch {
    // The browser can't read it: send it as it is (the server checks type and size).
  }
  return file
}

async function upload(ref: JobRef, kind: FieldFile["kind"], blob: Blob, name: string): Promise<FieldFile | null> {
  const form = new FormData()
  form.set("tipo", ref.kind)
  form.set("ref", ref.id)
  form.set("clase", kind)
  form.set("archivo", blob, name)
  const r = await fetch("/api/interno/campo", { method: "POST", headers: { "x-interno-nombre": encodeURIComponent(readState().name) }, body: form }).catch(() => null)
  if (!r?.ok) return null
  const b = (await r.json().catch(() => ({}))) as { file?: FieldFile }
  return b.file ?? null
}

/** The job's record as it is now in this phone (an upload can finish after other edits), with its field work changed. */
function saveField(ref: JobRef, change: (f: FieldWork) => Partial<FieldWork>, extra: (rec: Appointment | Report) => object = () => ({})) {
  const updatedAt = new Date().toISOString()
  if (ref.kind === "agenda") {
    const a = agendaStore.list().find((x) => x.id === ref.id)
    if (a) agendaStore.save({ ...a, ...extra(a), field: { ...a.field, ...change(a.field) }, updatedAt })
  } else {
    const r = reportsStore.list().find((x) => x.id === ref.id)
    if (r) reportsStore.save({ ...r, ...extra(r), field: { ...r.field, ...change(r.field) }, updatedAt })
  }
}

/**
 * /interno/tecnico (WispDavor phase 5, owner 2026-11-21: "Same /interno, Técnico view"): the day's installations and
 * visits (Agenda, and Reportes with a visit that day) of the technician using the phone, in time order, each with
 * check-in, photos, materials used (stock movements), the client's signature and "Terminar" (the appointment is done,
 * the report resolved).
 */
export function TecnicoApp() {
  const t = useTranslations("tecnico")
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const names = useTechnicians()
  const [day, setDay] = useState("")
  const [who, setWho] = useState<string | null>(null)
  const [openId, setOpenId] = useState("")
  if (!agenda.loaded || !reports.loaded || !clients.loaded) return null
  const today = localToday()
  const date = day || today
  const me = who ?? readState().name.trim()
  const jobs: Job[] = [
    ...agenda.list.filter((a) => a.date === date && a.status !== "cancelada").map((a): Job => ({ kind: "agenda", ref: { kind: "agenda", id: a.id }, time: a.time, who: a.who, done: a.status === "hecha", rec: a })),
    ...reports.list
      .filter((r) => r.visitDate === date && (r.status === "visita" || (r.status === "resuelto" && !!r.field.doneAt)))
      .map((r): Job => ({ kind: "reporte", ref: { kind: "reporte", id: r.id }, time: "", who: r.assignee, done: r.status === "resuelto", rec: r })),
  ]
    .filter((j) => !me || fold(j.who) === fold(me))
    .sort((a, b) => Number(a.done) - Number(b.done) || byWhen({ date, time: a.time }, { date, time: b.time }))
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid items-end gap-3 sm:grid-cols-3">
        <PickField label={t("who")} value={me} onChange={setWho} options={[{ value: "", label: t("everyone") }, ...names.map((n) => ({ value: n, label: n }))]} />
        <DateField label={t("day")} value={date} onChange={setDay} />
        <div className="flex gap-2">
          <button type="button" onClick={() => setDay(addDays(date, -1))} className={BTN} aria-label={t("prev")}>
            ←
          </button>
          <button type="button" onClick={() => setDay(today)} className={BTN}>
            {t("today")}
          </button>
          <button type="button" onClick={() => setDay(addDays(date, 1))} className={BTN} aria-label={t("next")}>
            →
          </button>
        </div>
      </div>
      {!jobs.length && <p className="text-sm text-zinc-400">{me ? t("noneMine", { who: me }) : t("none")}</p>}
      <ol className="grid gap-3">
        {jobs.map((j, i) => (
          <JobCard key={`${j.ref.kind}-${j.ref.id}`} n={i + 1} job={j} open={openId === j.ref.id} toggle={() => setOpenId(openId === j.ref.id ? "" : j.ref.id)} items={catalog.items} clientName={clients.list.find((c) => c.id === j.rec.clientId)?.name ?? ""} />
        ))}
      </ol>
    </div>
  )
}

function JobCard({ n, job, open, toggle, items, clientName }: { n: number; job: Job; open: boolean; toggle: () => void; items: Parameters<typeof MoveForm>[0]["items"]; clientName: string }) {
  const t = useTranslations("tecnico")
  const f = job.rec.field
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [moving, setMoving] = useState(false)
  const [signature, setSignature] = useState<Blob | null>(null)
  const [signer, setSigner] = useState("")
  const name = job.rec.name || clientName
  const phone = job.rec.phone.replace(/\D/g, "")
  const wa = phone.length === 10 ? `52${phone}` : phone
  const title = job.kind === "agenda" ? t(`kinds.${job.rec.kind}`) : `${t("report")} ${reportCode(job.rec)} · ${t(`categories.${job.rec.category}`)}`
  const signed = f.files.some((x) => x.kind === "firma")
  const arrive = () => {
    const done = (lat: number | null, lng: number | null) => saveField(job.ref, () => ({ arrivedAt: new Date().toISOString(), lat, lng }))
    if (!navigator.geolocation) return done(null, null)
    navigator.geolocation.getCurrentPosition(
      (p) => done(Math.round(p.coords.latitude * 1e5) / 1e5, Math.round(p.coords.longitude * 1e5) / 1e5),
      () => done(null, null),
      { timeout: 8000, maximumAge: 60000 }
    )
  }
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setMsg("")
    let ok = 0
    for (const file of [...files].slice(0, MAX_FIELD_FILES - f.files.length)) {
      const saved = await upload(job.ref, "foto", await shrink(file), file.name.replace(/\.[^.]+$/, "") + ".jpg")
      if (saved) {
        ok++
        saveField(job.ref, (cur) => ({ files: [...cur.files, saved] }))
      }
    }
    setBusy(false)
    setMsg(ok === files.length ? t("photosSaved", { n: ok }) : t("photosFailed"))
  }
  const sign = async () => {
    if (!signature || !signer.trim()) return
    setBusy(true)
    const saved = await upload(job.ref, "firma", signature, "firma.png")
    setBusy(false)
    if (!saved) return setMsg(t("signFailed"))
    saveField(job.ref, (cur) => ({ files: [...cur.files, saved], signedBy: signer.trim() }))
    setSignature(null)
    setMsg(t("signed"))
  }
  const finish = () => {
    if (!signed && !window.confirm(t("confirmNoSign"))) return
    const now = new Date().toISOString()
    saveField(
      job.ref,
      () => ({ doneAt: now }),
      (rec) => ("visitDate" in rec ? { status: "resuelto", resolvedAt: rec.resolvedAt || now, resolution: rec.resolution || f.notes } : { status: "hecha" })
    )
  }
  const reopen = () => saveField(job.ref, () => ({ doneAt: "" }), (rec) => ("visitDate" in rec ? { status: "visita", resolvedAt: "" } : { status: "confirmada" }))
  const state = job.done ? t("state.done", { time: hhmm(f.doneAt) || "—" }) : f.arrivedAt ? t("state.onSite", { time: hhmm(f.arrivedAt) }) : t("state.pending")
  return (
    <li className={`grid gap-3 rounded-2xl border p-4 ${job.done ? "border-emerald-400/25" : f.arrivedAt ? "border-amber-300/40" : "border-white/10"}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="grid gap-1 text-left">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base text-foreground">{`${n}. ${job.time ? `${job.time} · ` : ""}${title}`}</span>
          <span className={`font-mono text-xs ${job.done ? "text-emerald-300" : f.arrivedAt ? "text-amber-200" : "text-zinc-400"}`}>{state}</span>
        </span>
        <span className="text-sm text-zinc-200">{name || t("noName")}</span>
        {job.rec.address && <span className="text-sm text-zinc-400">{job.rec.address}</span>}
      </button>
      {open && (
        <div className="grid gap-4 border-t border-white/10 pt-3">
          {job.kind === "reporte" && job.rec.description && <p className="text-sm text-zinc-300">{job.rec.description}</p>}
          {job.kind === "agenda" && job.rec.notes && <p className="text-sm text-zinc-300">{job.rec.notes}</p>}
          <div className="flex flex-wrap gap-2">
            {job.rec.address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.rec.address)}`} target="_blank" rel="noopener noreferrer" className={BTN}>
                {t("map")}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} className={BTN}>
                {t("call")}
              </a>
            )}
            {wa && (
              <a href={whatsappHref(wa, t("onMyWay", { name: name.split(/\s+/)[0] ?? "" }))} target="_blank" rel="noopener noreferrer" className={BTN}>
                {t("whatsapp")}
              </a>
            )}
            {job.rec.clientId && (
              <a href={`/interno/admin/clientes?c=${job.rec.clientId}`} className={BTN}>
                {t("client")}
              </a>
            )}
          </div>
          {job.done ? (
            <div className="grid gap-2">
              <p className="text-sm text-emerald-200">{t("doneSummary", { photos: f.files.filter((x) => x.kind === "foto").length, signer: f.signedBy || "—" })}</p>
              <button type="button" onClick={reopen} className={BTN}>
                {t("reopen")}
              </button>
            </div>
          ) : (
            <>
              {!f.arrivedAt && (
                <button type="button" onClick={arrive} className={PRIMARY}>
                  {t("arrive")}
                </button>
              )}
              <section aria-label={t("photos")} className="grid gap-2">
                <h3 className="text-sm text-zinc-200">{t("photos")}</h3>
                <div className="flex flex-wrap gap-2">
                  {f.files.map((x) => (
                    <a key={x.id} href={`/api/interno/campo/${x.id}`} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private files behind the session; no image optimizer for them */}
                      <img src={`/api/interno/campo/${x.id}`} alt={x.kind === "firma" ? t("signatureAlt", { name: f.signedBy }) : t("photoAlt", { name: x.name })} className={`h-16 w-16 rounded-lg border border-white/10 object-cover ${x.kind === "firma" ? "bg-white" : ""}`} loading="lazy" />
                    </a>
                  ))}
                </div>
                <label className={`${BTN} cursor-pointer`}>
                  {busy ? t("uploading") : t("addPhotos")}
                  <input type="file" accept="image/*" capture="environment" multiple disabled={busy || f.files.length >= MAX_FIELD_FILES} className="sr-only" onChange={(e) => void addPhotos(e.target.files)} />
                </label>
              </section>
              <section aria-label={t("materials")} className="grid gap-2">
                <h3 className="text-sm text-zinc-200">{t("materials")}</h3>
                {f.batch && <p className="text-xs text-emerald-300">{t("materialsSaved")}</p>}
                {moving ? (
                  <MoveForm
                    items={items}
                    kind={job.kind === "agenda" && job.rec.kind === "instalacion" ? "instalacion" : "reemplazo"}
                    clientId={job.rec.clientId}
                    notes={title}
                    onDone={(m, batch) => {
                      setMoving(false)
                      if (batch) saveField(job.ref, () => ({ batch }))
                      if (m) setMsg(m)
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setMoving(true)} className={BTN}>
                    {f.batch ? t("materialsMore") : t("materialsAdd")}
                  </button>
                )}
              </section>
              <section aria-label={t("signature")} className="grid gap-2">
                <h3 className="text-sm text-zinc-200">{t("signature")}</h3>
                {signed ? (
                  <p className="text-xs text-emerald-300">{t("signedBy", { name: f.signedBy })}</p>
                ) : (
                  <>
                    <TextField label={t("signer")} value={signer} onChange={(v) => setSigner(v.slice(0, 120))} />
                    <SignaturePad label={t("signHere")} clearLabel={t("clear")} onChange={setSignature} />
                    <button type="button" disabled={!signature || !signer.trim() || busy} onClick={() => void sign()} className={BTN}>
                      {t("saveSignature")}
                    </button>
                  </>
                )}
              </section>
              <AreaField label={t("notes")} value={f.notes} onChange={(v) => saveField(job.ref, () => ({ notes: v.slice(0, 2000) }))} />
              <button type="button" onClick={finish} className={PRIMARY}>
                {t("finish")}
              </button>
            </>
          )}
          {msg && (
            <p role="status" className="text-sm text-zinc-200">
              {msg}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
