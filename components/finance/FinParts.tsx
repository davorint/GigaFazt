"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { AGING, CFDI_METHODS, FIN_METHODS, balanceOf, complementDeadline, complementPending, folio, newFinPayment, overpaid, paidOf, type AgingBucket, type Cfdi, type FinMethod, type FinPayment, type FinStatus } from "@/lib/finance/common"
import { mxn } from "@/lib/materials/catalog"
import { localToday } from "@/lib/clients/from-lead"

type T = ReturnType<typeof useTranslations>
export const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
export const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
export const PRIMARY = "h-10 w-fit rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

export const STATUS_TONE: Record<FinStatus, string> = {
  pendiente: "border-amber-400/40 text-amber-200",
  parcial: "border-cyan-400/40 text-cyan-200",
  vencido: "border-red-400/40 text-red-300",
  pagado: "border-emerald-400/40 text-emerald-300",
  cancelado: "border-white/15 text-zinc-400 line-through",
}

export function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-white/10 p-3">
      <span className="font-mono text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</span>
      <span className={`font-mono text-lg tabular-nums ${tone || "text-foreground"}`}>{value}</span>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  )
}

/** The aging of what's still open: not due yet, 0–30, 31–60, 61–90 and more than 90 days past due. */
export function AgingTiles({ t, totals }: { t: T; totals: Record<AgingBucket, number> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {AGING.map((b) => (
        <Tile key={b} label={t(`aging.${b}`)} value={mxn(totals[b])} tone={b === "porVencer" ? "" : totals[b] > 0 ? "text-red-300" : ""} />
      ))}
    </div>
  )
}

/**
 * The payments of a document: each one with date, amount, method and reference; add one (the balance by default). On a
 * PPD invoice each payment also carries its own complemento de pago (SAT: one per payment, by day 5 of the next month).
 */
export function PaymentsEditor({ t, doc, onChange, side, today }: { t: T; doc: { amount: number; payments: FinPayment[]; cfdi: Cfdi }; onChange: (payments: FinPayment[]) => void; side: "pagar" | "cobrar"; today: string }) {
  const [adding, setAdding] = useState<FinPayment | null>(null)
  const bal = balanceOf(doc)
  const ppd = doc.cfdi.method === "PPD"
  const setPayment = (p: FinPayment) => onChange(doc.payments.map((x) => (x.id === p.id ? p : x)))
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{t("payments.title")}</legend>
      <p className="text-xs text-zinc-300">{t("payments.summary", { paid: mxn(paidOf(doc)), balance: mxn(bal) })}</p>
      {overpaid(doc) && <p className="text-xs text-amber-200">{t("payments.overpaid", { extra: mxn(paidOf(doc) - doc.amount) })}</p>}
      {doc.payments.length > 0 && (
        <ul className="grid gap-1">
          {doc.payments.map((p) => (
            <li key={p.id} className="grid gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-zinc-100">
                  {p.date || "—"} · {mxn(p.amount)} · {t(`methods.${p.method}`)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <button type="button" onClick={() => window.confirm(t("payments.confirmRemove")) && onChange(doc.payments.filter((x) => x.id !== p.id))} className={DANGER}>
                  {t("payments.remove")}
                </button>
              </span>
              {ppd && (
                <span className="grid items-start gap-2 sm:grid-cols-2">
                  <label className="flex min-h-10 items-center gap-2 text-xs text-zinc-200">
                    <input type="checkbox" checked={p.repDone} onChange={(e) => setPayment({ ...p, repDone: e.target.checked })} className="size-5 accent-white" />
                    {t(`cfdi.complementDone.${side}`)}
                  </label>
                  <TextField label={t("cfdi.complementUuid")} value={p.rep} onChange={(v) => setPayment({ ...p, rep: v.trim().toUpperCase().slice(0, 36) })} />
                  {!p.repDone && p.date && (
                    <span className={`text-xs sm:col-span-2 ${complementDeadline(p.date) < today ? "text-red-300" : "text-amber-200"}`}>{t(`cfdi.payDeadline.${side}`, { date: complementDeadline(p.date) })}</span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="grid gap-3 rounded-lg border border-white/15 p-3">
          <div className={GRID}>
            <DateField label={t("payments.date")} value={adding.date} onChange={(date) => setAdding({ ...adding, date })} />
            <NumberField label={t("payments.amount")} unit="MXN" optional max={1e9} precision={2} value={adding.amount || null} onChange={(v) => setAdding({ ...adding, amount: v ?? 0 })} />
            <PickField label={t("payments.method")} value={adding.method} onChange={(method: FinMethod) => setAdding({ ...adding, method })} options={FIN_METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))} />
            <TextField label={t("payments.reference")} value={adding.reference} onChange={(reference) => setAdding({ ...adding, reference: reference.slice(0, 120) })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!(adding.amount > 0) || !adding.date}
              onClick={() => {
                onChange([...doc.payments, adding])
                setAdding(null)
              }}
              className={`${PRIMARY} disabled:opacity-50`}
            >
              {t("payments.save")}
            </button>
            <button type="button" onClick={() => setAdding(null)} className={SMALL}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        bal > 0 && (
          <button type="button" onClick={() => setAdding(newFinPayment({ date: localToday(), amount: bal }))} className={SMALL}>
            {t("payments.add")}
          </button>
        )
      )}
    </fieldset>
  )
}

/** The invoice (CFDI): folio fiscal, PUE or PPD, and for PPD whether the complemento de pago is done. */
export function CfdiEditor({ t, doc, onChange, side, today }: { t: T; doc: { cfdi: Cfdi; payments: FinPayment[] }; onChange: (cfdi: Cfdi) => void; side: "pagar" | "cobrar"; today: string }) {
  const c = doc.cfdi
  const deadline = complementPending(doc)
  const badUuid = (v: string) => v.trim() !== "" && !folio(v)
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{t("cfdi.title")}</legend>
      <div className={GRID}>
        <TextField label={t("cfdi.uuid")} value={c.uuid} onChange={(v) => onChange({ ...c, uuid: v.trim().toUpperCase().slice(0, 36) })} hint={badUuid(c.uuid) ? t("cfdi.badUuid") : t("cfdi.uuidHint")} />
        <PickField label={t("cfdi.method")} value={c.method} onChange={(method) => onChange({ ...c, method })} hint={t("cfdi.methodHint")} options={CFDI_METHODS.map((m) => ({ value: m, label: t(`cfdi.methods.${m || "none"}`) }))} />
      </div>
      {c.method === "PPD" && <p className="text-xs text-zinc-400">{t("cfdi.perPayment")}</p>}
      {deadline && <p className={`text-xs ${deadline < today ? "text-red-300" : "text-amber-200"}`}>{t(`cfdi.pending.${side}`, { date: deadline })}</p>}
    </fieldset>
  )
}
