"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { readState } from "@/lib/sync/state"
import { DEFAULT_NOTICES, PAY_BY_DAY, type AutoNotices } from "@/lib/wispdavor/selfservice"

const DAYS = Array.from({ length: PAY_BY_DAY }, (_, i) => i + 1)

/**
 * Automatic WhatsApp notices (phase 9): payment reminders by the daily job and report updates. Off until an admin turns
 * them on; the templates must be approved by Meta first (the list below in Avisos).
 */
export function AutoNoticesPanel({ configured }: { configured: boolean | null }) {
  const t = useTranslations("wispdavor.autoNotices")
  const [s, setS] = useState<AutoNotices | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [msg, setMsg] = useState("")
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await fetch("/api/interno/whatsapp", { cache: "no-store" })
        const b = (await r.json()) as { notices?: AutoNotices | null; canEdit?: boolean }
        if (!live) return
        setS(b.notices ?? DEFAULT_NOTICES)
        setCanEdit(Boolean(b.canEdit))
      } catch {
        if (live) setMsg(t("offline"))
      }
    })()
    return () => {
      live = false
    }
  }, [t])
  const save = async (next: AutoNotices) => {
    setS(next)
    setMsg("")
    try {
      const r = await fetch("/api/interno/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) },
        body: JSON.stringify({ action: "notices", notices: next }),
      })
      const b = (await r.json()) as { notices?: AutoNotices; error?: string }
      if (r.ok && b.notices) {
        setS(b.notices)
        setMsg(t("saved"))
      } else setMsg(t(b.error === "admin-only" ? "adminOnly" : "offline"))
    } catch {
      setMsg(t("offline"))
    }
  }
  if (!s) return msg ? <p className="text-xs text-amber-200">{msg}</p> : null
  const box = "size-5 accent-white"
  return (
    <section aria-labelledby="wd-auto" className="grid gap-3 rounded-2xl border border-white/10 p-4">
      <h2 id="wd-auto" className="text-lg font-light text-foreground">
        {t("title")}
      </h2>
      <p className="text-xs text-zinc-400">{t("lead")}</p>
      {configured === false && <p className="text-xs text-amber-200">{t("noKeys")}</p>}
      {!canEdit && <p className="text-xs text-zinc-400">{t("adminOnly")}</p>}
      <fieldset disabled={!canEdit} className="grid gap-3 disabled:opacity-60">
        <label className="flex items-center gap-2 text-sm text-zinc-100">
          <input type="checkbox" className={box} checked={s.reminders} onChange={(e) => void save({ ...s, reminders: e.target.checked })} />
          {t("reminders")}
        </label>
        <div className="flex flex-wrap gap-3 pl-7">
          <label className="grid gap-1 text-xs text-zinc-400">
            {t("reminderDay")}
            <select value={s.reminderDay} onChange={(e) => void save({ ...s, reminderDay: Number(e.target.value) })} className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100">
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {t("day", { d })}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-zinc-400">
            {t("noticeDay")}
            <select value={s.noticeDay} onChange={(e) => void save({ ...s, noticeDay: Number(e.target.value) })} className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100">
              {DAYS.filter((d) => d >= s.reminderDay).map((d) => (
                <option key={d} value={d}>
                  {t("day", { d })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="pl-7 text-xs text-zinc-400">{t("remindersHint", { by: PAY_BY_DAY })}</p>
        <label className="flex items-center gap-2 text-sm text-zinc-100">
          <input type="checkbox" className={box} checked={s.reportUpdates} onChange={(e) => void save({ ...s, reportUpdates: e.target.checked })} />
          {t("reportUpdates")}
        </label>
        <p className="pl-7 text-xs text-zinc-400">{t("reportHint")}</p>
      </fieldset>
      {msg && (
        <p role="status" className="text-xs text-zinc-200">
          {msg}
        </p>
      )}
    </section>
  )
}
