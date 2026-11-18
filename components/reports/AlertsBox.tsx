"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { readState } from "@/lib/sync/state"

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
type Channels = { telegram: boolean; webhook: boolean }

/**
 * Whether the team gets an alert for each report from the public form (lib/reports/notify.ts), how to switch it on,
 * and a test button. Read from /api/interno/avisos (only yes/no per channel).
 */
export function AlertsBox() {
  const t = useTranslations("reportes.alerts")
  const [ch, setCh] = useState<Channels | null | "error">(null)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    fetch("/api/interno/avisos")
      .then((r) => (r.ok ? (r.json() as Promise<Channels>) : Promise.reject(new Error(String(r.status)))))
      .then((v) => live && setCh({ telegram: v.telegram === true, webhook: v.webhook === true }))
      .catch(() => live && setCh("error"))
    return () => {
      live = false
    }
  }, [])
  const test = async () => {
    setBusy(true)
    setMsg("")
    try {
      const r = await fetch("/api/interno/avisos", { method: "POST", headers: { "x-interno-nombre": encodeURIComponent(readState().name) } })
      const v = (await r.json().catch(() => ({}))) as { ok?: boolean }
      setMsg(r.ok && v.ok ? t("testOk") : t("testFail"))
    } catch {
      setMsg(t("testFail"))
    } finally {
      setBusy(false)
    }
  }
  const on = ch && ch !== "error" && (ch.telegram || ch.webhook)
  return (
    <details className="rounded-xl border border-white/10 p-3 text-sm">
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-zinc-100">
        <span className={`size-2 rounded-full ${on ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden />
        {ch === null ? t("loading") : ch === "error" ? t("unknown") : on ? t("on", { list: [ch.telegram && "Telegram", ch.webhook && "webhook"].filter(Boolean).join(" + ") }) : t("off")}
      </summary>
      <div className="mt-3 grid gap-2 text-zinc-300">
        <p>{t("what")}</p>
        <ol className="grid list-decimal gap-1 pl-5">
          {(t.raw("steps") as string[]).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-xs text-zinc-400">{t("webhook")}</p>
        {on && (
          <button type="button" onClick={test} disabled={busy} className={SMALL}>
            {busy ? t("testing") : t("test")}
          </button>
        )}
        {msg && (
          <p role="status" className="text-sm text-zinc-100">
            {msg}
          </p>
        )}
      </div>
    </details>
  )
}
