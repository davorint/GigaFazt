"use client"

import { useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"
import { SignaturePad } from "@/components/tecnico/SignaturePad"

type Contract = { title: string; text: string; version: number; signed: string; earlier: string } | null
const CARD = "grid gap-4 rounded-2xl border border-white/10 p-5"

/**
 * "Tu contrato" in the client portal (phase 15): the owner's text with the client's data, signed here with their full
 * name, a drawn signature and "I read and accept". Nothing shows until the owner has set a text.
 */
export function PortalContract({ token, day }: { token: string; day: (d: string) => string }) {
  const t = useTranslations("portal.contract")
  const id = useId()
  const [c, setC] = useState<Contract | undefined>(undefined)
  const [name, setName] = useState("")
  const [accept, setAccept] = useState(false)
  const [sig, setSig] = useState<Blob | null>(null)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    fetch("/api/mi-cuenta/contrato", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => (r.ok ? ((await r.json()) as { contract: Contract }).contract : null))
      .then((x) => live && setC(x))
      .catch(() => live && setC(null))
    return () => {
      live = false
    }
  }, [token])
  if (!c) return null
  const sign = async () => {
    if (!sig || !accept || !name.trim()) return setMsg(t("missing"))
    setBusy(true)
    setMsg("")
    try {
      const form = new FormData()
      form.set("token", token)
      form.set("version", String(c.version))
      form.set("nombre", name)
      form.set("firma", sig, "firma.png")
      const r = await fetch("/api/mi-cuenta/contrato", { method: "POST", body: form })
      const b = (await r.json().catch(() => ({}))) as { date?: string; error?: string }
      if (r.ok && b.date) setC({ ...c, signed: b.date })
      else setMsg(t(`errors.${["name", "signature", "stale", "too_many"].includes(b.error ?? "") ? b.error : "error"}`))
    } catch {
      setMsg(t("errors.error"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby={`${id}-h`} className={CARD}>
      <h2 id={`${id}-h`} className="text-lg font-medium text-foreground">
        {t("title")}
      </h2>
      {c.signed ? (
        <p className="text-sm text-emerald-300">{t("signed", { date: day(c.signed) })}</p>
      ) : (
        <>
          {c.earlier && <p className="text-sm text-amber-200">{t("changed", { date: day(c.earlier) })}</p>}
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
          <div tabIndex={0} role="region" aria-label={c.title} className="max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            <p className="mb-3 font-medium">{c.title}</p>
            {c.text}
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-n`} className="text-sm text-muted-foreground">
              {t("name")}
            </label>
            <input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-11 rounded-lg border border-white/15 bg-zinc-950 px-3 text-base text-foreground" />
          </div>
          <SignaturePad label={t("signature")} clearLabel={t("clear")} onChange={setSig} />
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-white" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            {t("accept")}
          </label>
          <button type="button" disabled={busy} onClick={() => void sign()} className="inline-flex min-h-11 w-fit items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50">
            {busy ? t("signing") : t("sign")}
          </button>
          {msg && (
            <p role="status" className="text-sm text-amber-200">
              {msg}
            </p>
          )}
        </>
      )}
    </section>
  )
}
