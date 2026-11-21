"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { DateField, PickField } from "@/components/surveys/SurveyFields"
import { PRIMARY, SMALL } from "@/components/finance/FinParts"
import { localToday } from "@/lib/clients/from-lead"
import { clientLabel, type Client } from "@/lib/clients/model"
import { whatsappHref } from "@/lib/contact"
import { mxn } from "@/lib/materials/catalog"
import { ledger } from "@/lib/payments/model"
import { siteLabel } from "@/lib/sites/model"
import { readState } from "@/lib/sync/state"
import { cutLists } from "@/lib/wispdavor/cortes"
import { MANUAL_TEMPLATES, MAX_PER_SEND, TEMPLATES, TEMPLATE_IDS, fill, waNumber, type TemplateId } from "@/lib/wispdavor/whatsapp"
import { portalUrl } from "./PortalAdmin"
import { useWispData } from "./useWispData"

const AUDIENCES = ["porVencer", "atrasados", "reconectar", "activos", "despliegue"] as const
type Audience = (typeof AUDIENCES)[number]
type Link = { clientId: string; token: string; revokedAt: string }

/** "10 de diciembre" from YYYY-MM-DD. */
const dayLabel = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : "")
/** Day 10 of this month: the last day to pay before the cut (Cobranza: late on the 11th). */
const payBy = (today: string) => `${today.slice(0, 7)}-10`

/** /interno/software/wispdavor/avisos: notices by WhatsApp, through the Cloud API when configured, else one-tap links. */
export function NoticesApp() {
  const t = useTranslations("wispdavor.avisos")
  const d = useWispData()
  const [template, setTemplate] = useState<TemplateId>("recordatorio")
  const [audience, setAudience] = useState<Audience>("porVencer")
  const [site, setSite] = useState("")
  const [place, setPlace] = useState("")
  const [date, setDate] = useState("")
  const [detail, setDetail] = useState("")
  /** "" = the default, day 10 of this month (set once the page has the date). */
  const [cutDateTyped, setCutDate] = useState("")
  const [api, setApi] = useState<boolean | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [result, setResult] = useState({ ok: 0, bad: 0 })
  useEffect(() => {
    void (async () => {
      try {
        const [w, p] = await Promise.all([fetch("/api/interno/whatsapp", { cache: "no-store" }), fetch("/api/interno/portal", { cache: "no-store" })])
        setApi(w.ok ? Boolean(((await w.json()) as { configured?: boolean }).configured) : false)
        if (p.ok) setLinks((((await p.json()) as { links?: Link[] }).links ?? []).filter((l) => !l.revokedAt))
      } catch {
        setApi(false)
      }
    })()
  }, [])
  if (!d.loaded) return null
  const today = localToday()
  const cutDate = cutDateTyped || payBy(today)
  const restoreIds = new Set(cutLists(d.clients, d.payments, today).restore.map((r) => r.clientId))
  const withService = d.clients.filter((c) => c.services.some((s) => s.status !== "cancelado"))
  const who: Client[] = withService.filter((c) => {
    if (audience === "activos") return true
    if (audience === "despliegue") return !!site && c.siteId === site
    if (audience === "reconectar") return restoreIds.has(c.id)
    const st = ledger(c, d.payments, today).status
    return audience === "atrasados" ? st === "atrasado" : st === "por-vencer"
  })
  const link = (c: Client) => {
    const l = links.find((x) => x.clientId === c.id)
    return l ? portalUrl(l.token) : `${window.location.origin}/clientes`
  }
  const values = (c: Client): string[] => {
    const first = c.name.trim().split(/\s+/)[0] || clientLabel(c)
    const l = ledger(c, d.payments, today)
    if (template === "reconexion") return [first]
    if (template === "mantenimiento") return [first, place, dayLabel(date), detail]
    if (template === "corte") return [first, mxn(l.owed), dayLabel(cutDate), link(c)]
    return [first, mxn(l.owed > 0 ? l.owed : l.monthly), dayLabel(l.nextDue || payBy(today)), link(c)]
  }
  const rows = who.map((c) => ({ c, phone: waNumber(c.whatsapp || c.phone), values: values(c) }))
  const ready = rows.filter((r) => r.phone)
  const missing = rows.length - ready.length
  const send = async () => {
    if (!window.confirm(t("confirmSend", { template: t(`templates.${template}`), n: ready.length }))) return
    setState("sending")
    let ok = 0
    let bad = 0
    for (let i = 0; i < ready.length; i += MAX_PER_SEND) {
      const batch = ready.slice(i, i + MAX_PER_SEND)
      try {
        const r = await fetch("/api/interno/whatsapp", {
          method: "POST",
          headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) },
          body: JSON.stringify({ template, items: batch.map((x) => ({ clientId: x.c.id, phone: x.phone, values: x.values })) }),
        })
        const b = (await r.json().catch(() => ({}))) as { results?: { ok: boolean }[] }
        const res = b.results ?? []
        ok += res.filter((x) => x.ok).length
        bad += batch.length - res.filter((x) => x.ok).length
      } catch {
        bad += batch.length
      }
    }
    setResult({ ok, bad })
    setState("done")
  }
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {api !== null && <p className={`text-xs ${api ? "text-emerald-300" : "text-amber-200"}`}>{api ? t("apiOn") : t("apiOff")}</p>}
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PickField label={t("template")} value={template} onChange={setTemplate} options={MANUAL_TEMPLATES.map((x) => ({ value: x, label: t(`templates.${x}`) }))} />
        <PickField label={t("audience")} value={audience} onChange={setAudience} options={AUDIENCES.map((x) => ({ value: x, label: t(`audiences.${x}`) }))} />
        {audience === "despliegue" && <PickField label={t("site")} value={site} onChange={setSite} options={[{ value: "", label: "—" }, ...d.sites.map((s) => ({ value: s.id, label: siteLabel(s) }))]} />}
        {template === "corte" && <DateField label={t("cutDate")} value={cutDate} onChange={setCutDate} />}
        {template === "mantenimiento" && (
          <>
            <TextField label={t("place")} value={place} onChange={setPlace} />
            <DateField label={t("date")} value={date} onChange={setDate} />
            <TextField label={t("detail")} value={detail} onChange={setDetail} />
          </>
        )}
      </div>
      <div className="grid gap-2">
        <p className="text-sm text-zinc-200">{t("count", { n: ready.length })}</p>
        {missing > 0 && <p className="text-xs text-amber-200">{t("noPhone", { n: missing })}</p>}
        {ready[0] && (
          <>
            <p className="text-xs text-zinc-400">{t("preview")}</p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-100">{fill(template, ready[0].values)}</p>
          </>
        )}
        {(template === "recordatorio" || template === "corte") && <p className="text-xs text-zinc-400">{t("linkNote")}</p>}
      </div>
      {api && ready.length > 0 && (
        <div className="grid gap-2">
          <button type="button" disabled={state === "sending"} onClick={send} className={`${PRIMARY} disabled:opacity-50`}>
            {state === "sending" ? t("sending") : t("sendAll", { n: ready.length })}
          </button>
          {state === "done" && <p role="status" className="text-sm text-zinc-200">{t("sent", { ok: result.ok, bad: result.bad })}</p>}
        </div>
      )}
      {api === false && ready.length > 0 && (
        <ul className="grid gap-2">
          {ready.map((r) => (
            <li key={r.c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3">
              <span className="text-sm text-zinc-200">{clientLabel(r.c)}</span>
              <a href={whatsappHref(r.phone!, fill(template, r.values))} target="_blank" rel="noopener noreferrer" className={SMALL}>
                {t("open")}
              </a>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("setup.title")}</summary>
        <div className="mt-3 grid gap-4">
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            {(t.raw("setup.steps") as string[]).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <ul className="grid gap-3">
            {TEMPLATE_IDS.map((id) => (
              <li key={id} className="grid gap-1 rounded-xl border border-white/10 p-3">
                <p className="font-mono text-xs text-zinc-200">{TEMPLATES[id].name}</p>
                <p className="text-sm text-zinc-300">{TEMPLATES[id].body}</p>
                <p className="text-xs text-zinc-400">{t("setup.variables", { list: TEMPLATES[id].params.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ") })}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  )
}
