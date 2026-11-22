"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"
import { SYNC_KINDS } from "@/lib/sync/protocol"

type Entry = { at: string; who: string; kind: string; ref: string; what: string; label: string; detail: string }
type Data = { entries: Entry[]; people: string[]; more: boolean }
const DAYS = [1, 7, 30, 90]
const KINDS = [...SYNC_KINDS, "router", "whatsapp"]
const SELECT = "h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
const TONE: Record<string, string> = { new: "text-emerald-300", delete: "text-red-300", conflict: "text-amber-200" }
const when = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** /interno/admin/actividad (phase 14): who changed what, newest first, by person, kind of record and period. */
export function ActivityApp() {
  const t = useTranslations("equipo.activity")
  const id = useId()
  const [days, setDays] = useState(7)
  const [who, setWho] = useState("")
  const [kind, setKind] = useState("")
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setError("")
    try {
      const r = await fetch(`/api/interno/actividad?dias=${days}&quien=${encodeURIComponent(who)}&tipo=${kind}`, { cache: "no-store" })
      const b = (await r.json()) as Data & { error?: string }
      if (!r.ok) return setError(t(b.error === "forbidden" ? "forbidden" : "offline"))
      setD(b)
    } catch {
      setError(t("offline"))
    }
  }, [days, who, kind, t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloads when a filter changes
    void load()
  }, [load])
  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-d`} className="text-xs text-zinc-400">
            {t("period")}
          </label>
          <select id={`${id}-d`} className={SELECT} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS.map((n) => (
              <option key={n} value={n}>
                {t("days", { n })}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-w`} className="text-xs text-zinc-400">
            {t("who")}
          </label>
          <select id={`${id}-w`} className={SELECT} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t("everyone")}</option>
            {(d?.people ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-k`} className="text-xs text-zinc-400">
            {t("kind")}
          </label>
          <select id={`${id}-k`} className={SELECT} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("all")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p role="status" className="text-sm text-amber-200">
          {error}
        </p>
      )}
      {d && !d.entries.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      {d && d.entries.length > 0 && (
        <div tabIndex={0} role="region" aria-label={t("title")} className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th scope="col" className="px-3 py-2 font-normal">{t("cols.when")}</th>
                <th scope="col" className="px-3 py-2 font-normal">{t("cols.who")}</th>
                <th scope="col" className="px-3 py-2 font-normal">{t("cols.what")}</th>
                <th scope="col" className="px-3 py-2 font-normal">{t("cols.record")}</th>
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e, i) => (
                <tr key={`${e.kind}-${e.ref}-${e.at}-${i}`} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-400">{when(e.at)}</td>
                  <td className="px-3 py-2 text-zinc-100">{e.who || "—"}</td>
                  <td className={`px-3 py-2 text-xs ${TONE[e.what] ?? "text-zinc-300"}`}>
                    {t(`what.${e.what}`)} · {t(`kinds.${e.kind}`)}
                  </td>
                  <td className="px-3 py-2 text-zinc-200">
                    {e.label}
                    {e.detail && <span className="block font-mono text-xs text-zinc-400">{e.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d?.more && <p className="text-xs text-zinc-400">{t("more")}</p>}
    </div>
  )
}
