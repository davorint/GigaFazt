"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"
import { SYNC_KINDS } from "@/lib/sync/protocol"
import { groupEntries, type Entry, type Group } from "@/lib/team/activity"

type Data = { entries: Entry[]; people: string[]; more: boolean }
/** Rows shown at a time. */
const PAGE = 100
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
  const [page, setPage] = useState(1)
  const load = useCallback(async () => {
    setError("")
    try {
      const r = await fetch(`/api/interno/actividad?dias=${days}&quien=${encodeURIComponent(who)}&tipo=${kind}`, { cache: "no-store" })
      const b = (await r.json()) as Data & { error?: string }
      if (!r.ok) return setError(t(b.error === "forbidden" ? "forbidden" : "offline"))
      setD(b)
      setPage(1)
    } catch {
      setError(t("offline"))
    }
  }, [days, who, kind, t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloads when a filter changes
    void load()
  }, [load])
  const groups = d ? groupEntries(d.entries) : []
  const shown = groups.slice(0, page * PAGE)
  const whatOf = (g: Group) => (g.n > 1 ? t("whatMany", { what: t(`what.${g.what}`), n: g.n, kind: t(`plural.${g.kind}`) }) : `${t(`what.${g.what}`)} · ${t(`kinds.${g.kind}`)}`)
  const labelsOf = (g: Group) => (g.n > 1 ? t("labels", { list: g.labels.slice(0, 3).join(", "), more: Math.max(0, g.n - 3) }) : g.label)
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
        <>
          {/* Phones: one card per group. */}
          <ul className="grid gap-2 sm:hidden">
            {shown.map((g, i) => (
              <li key={`${g.kind}-${g.ref}-${g.at}-${i}`} className="grid gap-1 rounded-xl border border-white/10 p-3 text-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-zinc-100">{g.who || "—"}</span>
                  <span className="font-mono text-xs text-zinc-400">{when(g.at)}</span>
                </span>
                <span className={`text-xs ${TONE[g.what] ?? "text-zinc-300"}`}>{whatOf(g)}</span>
                <span className="text-zinc-200">{labelsOf(g)}</span>
                {g.detail && <span className="font-mono text-xs text-zinc-400">{g.detail}</span>}
              </li>
            ))}
          </ul>
          <div tabIndex={0} role="region" aria-label={t("title")} className="hidden overflow-x-auto rounded-xl border border-white/10 sm:block">
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
                {shown.map((g, i) => (
                  <tr key={`${g.kind}-${g.ref}-${g.at}-${i}`} className="border-b border-white/5 align-top">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-400">{when(g.at)}</td>
                    <td className="px-3 py-2 text-zinc-100">{g.who || "—"}</td>
                    <td className={`px-3 py-2 text-xs ${TONE[g.what] ?? "text-zinc-300"}`}>{whatOf(g)}</td>
                    <td className="px-3 py-2 text-zinc-200">
                      {labelsOf(g)}
                      {g.detail && <span className="block font-mono text-xs text-zinc-400">{g.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.length > shown.length && (
            <button type="button" onClick={() => setPage((n) => n + 1)} className="inline-flex min-h-10 w-fit items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5">
              {t("showMore", { n: groups.length - shown.length })}
            </button>
          )}
        </>
      )}
      {d?.more && <p className="text-xs text-zinc-400">{t("more")}</p>}
    </div>
  )
}
