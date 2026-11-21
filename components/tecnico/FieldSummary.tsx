"use client"

import { useTranslations } from "next-intl"
import type { FieldWork } from "@/lib/field/model"

const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/**
 * What the technician recorded on a job (Técnico view), for the office: arrival (with where), finish, who signed,
 * photos and the signature, notes. Read-only; shown in Agenda and Reportes. Nothing when nothing was recorded.
 */
export function FieldSummary({ f }: { f: FieldWork }) {
  const t = useTranslations("tecnico.summary")
  if (!f.arrivedAt && !f.doneAt && !f.files.length && !f.notes) return null
  const where = f.lat !== null && f.lng !== null ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : ""
  return (
    <section aria-label={t("title")} className="grid gap-2 rounded-xl border border-white/10 p-3">
      <h4 className="text-sm font-medium text-zinc-100">{t("title")}</h4>
      <p className="text-xs text-zinc-300">
        {[f.arrivedAt ? t("arrived", { when: hhmm(f.arrivedAt) }) : "", f.doneAt ? t("done", { when: hhmm(f.doneAt) }) : t("notDone"), f.signedBy ? t("signed", { name: f.signedBy }) : t("notSigned")].filter(Boolean).join(" · ")}
        {where && (
          <>
            {" · "}
            <a href={where} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {t("where")}
            </a>
          </>
        )}
      </p>
      {f.notes && <p className="text-sm whitespace-pre-line text-zinc-200">{f.notes}</p>}
      {f.files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {f.files.map((x) => (
            <a key={x.id} href={`/api/interno/campo/${x.id}`} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- private files behind the session; no image optimizer for them */}
              <img src={`/api/interno/campo/${x.id}`} alt={x.kind === "firma" ? t("signatureAlt", { name: f.signedBy }) : t("photoAlt", { name: x.name })} className={`h-16 w-16 rounded-lg border border-white/10 object-cover ${x.kind === "firma" ? "bg-white" : ""}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {f.batch && <p className="text-xs text-zinc-400">{t("materials")}</p>}
    </section>
  )
}
