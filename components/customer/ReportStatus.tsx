"use client"

import { useId, useState, type FormEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Item = { code: string; category: string; status: string; createdAt: string; visitDate: string; resolvedAt: string }
const TONE: Record<string, string> = {
  nuevo: "border-sky-400/40 text-sky-200",
  "en-proceso": "border-amber-400/40 text-amber-200",
  visita: "border-violet-400/40 text-violet-200",
  resuelto: "border-emerald-400/40 text-emerald-200",
  descartado: "border-white/15 text-zinc-300",
}

/** /clientes → Mis reportes: a phone or a report code shows its reports' status (POST /api/clientes/reportes). */
export function ReportStatus() {
  const t = useTranslations("customer.status")
  const tr = useTranslations("report.categories")
  const locale = useLocale()
  const id = useId()
  const [q, setQ] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "invalid" | "busy" | "error">("idle")
  const [items, setItems] = useState<Item[] | null>(null)
  const date = (iso: string, withTime = false) => {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(locale === "es" ? "es-MX" : "en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setItems(null)
    // Same rule as the server (lib/customer/server.ts parseQuery): a report code or a 10-digit Mexican phone.
    const v = q.trim().replace(/\s+/g, "")
    if (!/^R-?[A-Z0-9]{6}$/i.test(v) && !/^(\+?52|04[45])?\d{10}$/.test(v.replace(/[-().]/g, ""))) return setState("invalid")
    setState("sending")
    try {
      const res = await fetch("/api/clientes/reportes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) })
      if (res.status === 422) return setState("invalid")
      if (res.status === 429) return setState("busy")
      const body = (await res.json().catch(() => ({}))) as { reports?: Item[] }
      if (!res.ok || !body.reports) throw new Error(String(res.status))
      setItems(body.reports)
      setState("idle")
    } catch {
      setState("error")
    }
  }
  return (
    <div className="grid gap-5">
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t("label")}
          </label>
          <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="tel" aria-describedby={`${id}-hint`} aria-invalid={state === "invalid" || undefined} className="h-11 bg-white/[0.03] text-base" />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t("hint")}
          </p>
        </div>
        <Button type="submit" size="lg" disabled={state === "sending"} className="sm:mb-6">
          {state === "sending" && <Loader2 aria-hidden className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>
      <div aria-live="polite" className="grid gap-3">
        {(state === "invalid" || state === "busy" || state === "error") && <p className="text-sm text-destructive">{t(state)}</p>}
        {items && !items.length && <p className="text-sm text-muted-foreground">{t("none")}</p>}
        {items && items.length > 0 && (
          <ul className="grid gap-3">
            {items.map((r) => (
              <li key={r.code} className="grid gap-1.5 rounded-xl border border-white/10 p-4">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-foreground">{r.code}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${TONE[r.status] ?? TONE.nuevo}`}>{t(`statuses.${r.status in TONE ? r.status : "nuevo"}`)}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {tr.has(r.category) ? tr(r.category) : r.category} · {t("opened", { date: date(r.createdAt, true) })}
                </span>
                {r.visitDate && <span className="text-sm text-violet-200">{t("visit", { date: date(r.visitDate) })}</span>}
                {r.resolvedAt && r.status === "resuelto" && <span className="text-sm text-emerald-200">{t("solved", { date: date(r.resolvedAt, true) })}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
