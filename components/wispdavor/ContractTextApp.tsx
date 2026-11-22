"use client"

import { useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"
import { newClient, newService } from "@/lib/clients/model"
import { readState } from "@/lib/sync/state"
import { FIELDS, MAX_BODY, fillTemplate, type Template } from "@/lib/wispdavor/contrato"

const INPUT = "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
/** A made-up client for the preview only (never saved). */
const SAMPLE = { ...newClient(), name: "Nombre Apellido", whatsapp: "55 0000 0000", building: "Edificio", tower: "A", apartment: "101", services: [{ ...newService("internet"), plan: "200M", monthly: 396, status: "activo" as const }] }

/**
 * /interno/software/wispdavor/contrato (phase 15): the client contract's text, as the owner's lawyer approved it. Each
 * change is a new version; the portal asks every client to sign the current one. Admins edit; everyone can read.
 */
export function ContractTextApp() {
  const t = useTranslations("wispdavor.contrato")
  const id = useId()
  const [tpl, setTpl] = useState<Template | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [msg, setMsg] = useState("")
  useEffect(() => {
    let live = true
    fetch("/api/interno/contrato", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { template?: Template; canEdit?: boolean }
        if (!live || !b.template) return
        setTpl(b.template)
        setCanEdit(Boolean(b.canEdit))
        setTitle(b.template.title)
        setBody(b.template.body)
      })
      .catch(() => live && setMsg(t("offline")))
    return () => {
      live = false
    }
  }, [t])
  if (!tpl) return msg ? <p className="mt-6 text-sm text-amber-200">{msg}</p> : null
  const save = async () => {
    if (!window.confirm(t(tpl.version === 0 ? "confirmFirst" : "confirm"))) return
    setMsg("")
    try {
      const r = await fetch("/api/interno/contrato", { method: "POST", headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) }, body: JSON.stringify({ title, body }) })
      const b = (await r.json()) as { template?: Template; error?: string }
      if (r.ok && b.template) {
        setTpl(b.template)
        setMsg(t("saved", { v: b.template.version }))
      } else setMsg(t(b.error === "admin-only" ? "adminOnly" : b.error === "empty" ? "empty" : "offline"))
    } catch {
      setMsg(t("offline"))
    }
  }
  const dirty = title !== tpl.title || body !== tpl.body
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {tpl.version === 0 ? (
        <p className="rounded-xl border border-amber-300/50 p-3 text-sm text-amber-100">
          <span className="mr-2 rounded border border-amber-300/50 px-1.5 py-0.5 font-mono text-[0.7rem]">POR DEFINIR</span>
          {t("placeholder")}
        </p>
      ) : (
        <p className="text-xs text-zinc-400">{t("current", { v: tpl.version, date: new Date(tpl.updatedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }), by: tpl.updatedBy || "—" })}</p>
      )}
      {!canEdit && <p className="text-xs text-zinc-400">{t("adminOnly")}</p>}
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="grid gap-1">
          <label htmlFor={`${id}-t`} className="text-xs text-zinc-400">
            {t("titleLabel")}
          </label>
          <input id={`${id}-t`} className={`${INPUT} h-10`} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-b`} className="text-xs text-zinc-400">
            {t("bodyLabel")}
          </label>
          <textarea id={`${id}-b`} aria-describedby={`${id}-f`} className={`${INPUT} min-h-80 py-2 font-mono text-xs leading-relaxed`} value={body} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} />
          <p id={`${id}-f`} className="text-xs text-zinc-400">
            {t("fields", { list: FIELDS.map((f) => `{{${f}}}`).join(" · ") })}
          </p>
        </div>
        <button type="button" disabled={!dirty || !title.trim() || !body.trim()} onClick={() => void save()} className="inline-flex min-h-10 w-fit items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50">
          {t("save")}
        </button>
      </fieldset>
      {msg && (
        <p role="status" className="text-sm text-zinc-200">
          {msg}
        </p>
      )}
      {body.trim() && (
        <section aria-labelledby={`${id}-p`} className="grid gap-2">
          <h2 id={`${id}-p`} className="text-base text-zinc-100">
            {t("preview")}
          </h2>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200" tabIndex={0} role="region" aria-label={t("preview")}>
            <p className="mb-3 font-medium">{title}</p>
            {fillTemplate(body, SAMPLE, new Date().toISOString().slice(0, 10))}
          </div>
        </section>
      )}
    </div>
  )
}
