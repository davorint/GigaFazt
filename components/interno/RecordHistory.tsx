"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { restoreRecord } from "@/lib/sync/engine"
import { recordLabel } from "@/lib/sync/labels"
import type { SyncKind } from "@/lib/sync/protocol"

type Version = { version: number; savedAt: string; savedBy: string; conflict: boolean; data: unknown }
type Deleted = { id: string; deletedAt: string; by: string; data: unknown }

const SMALL =
  "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const when = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

/** Loads when the panel is opened (the history lives in the database, not on the phone). */
function useLoad<T>(url: string) {
  const [state, setState] = useState<{ phase: "idle" | "loading" | "ok" | "error"; items: T[] }>({ phase: "idle", items: [] })
  const load = async () => {
    setState({ phase: "loading", items: [] })
    try {
      const r = await fetch(url, { cache: "no-store" })
      const j = (await r.json()) as { versions?: T[]; deleted?: T[] }
      if (!r.ok) throw new Error(String(r.status))
      setState({ phase: "ok", items: j.versions ?? j.deleted ?? [] })
    } catch {
      setState({ phase: "error", items: [] })
    }
  }
  return { ...state, load }
}

/** "Historial de cambios" inside a record's page: every saved version, who saved it and when, and "Restaurar". */
export function RecordHistory({ kind, id }: { kind: SyncKind; id: string }) {
  const t = useTranslations("sync.history")
  const h = useLoad<Version>(`/api/interno/historial?kind=${kind}&id=${encodeURIComponent(id)}`)
  const [done, setDone] = useState("")
  return (
    <details className="rounded-xl border border-white/10 p-3" onToggle={(e) => (e.currentTarget.open && h.phase === "idle" ? void h.load() : undefined)}>
      <summary className="cursor-pointer text-sm text-zinc-200">{t("title")}</summary>
      <div className="mt-3 grid gap-2">
        <p className="text-xs text-zinc-400">{t("lead")}</p>
        {h.phase === "loading" && <p className="text-sm text-zinc-400">{t("loading")}</p>}
        {h.phase === "error" && <p className="text-sm text-amber-200">{t("error")}</p>}
        {h.phase === "ok" && !h.items.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
        {done && (
          <p role="status" className="text-sm text-emerald-300">
            {done}
          </p>
        )}
        <ol className="grid gap-2">
          {h.items.map((v, i) => (
            <li key={`${v.version}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
              <span className="grid gap-0.5 text-sm">
                <span className="text-zinc-100">
                  {t("version", { n: v.version })} · {recordLabel(kind, v.data)}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {when(v.savedAt)} · {v.savedBy || t("anon")}
                  {v.conflict ? ` · ${t("conflict")}` : ""}
                </span>
              </span>
              {i > 0 && (
                <button
                  type="button"
                  className={SMALL}
                  onClick={() => {
                    if (!window.confirm(t("confirm", { n: v.version }))) return
                    setDone(restoreRecord(kind, v.data) ? t("restored", { n: v.version }) : t("error"))
                  }}
                >
                  {t("restore")}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}

/** "Borrados recientemente" at the bottom of a list: the records deleted in the last 90 days, each with "Restaurar". */
export function DeletedList({ kind, named }: { kind: SyncKind; named?: boolean }) {
  const t = useTranslations("sync.history")
  const h = useLoad<Deleted>(`/api/interno/historial?kind=${kind}&borrados=1`)
  const [back, setBack] = useState<string[]>([])
  return (
    <details className="rounded-xl border border-white/10 p-3" onToggle={(e) => (e.currentTarget.open && h.phase === "idle" ? void h.load() : undefined)}>
      <summary className="cursor-pointer text-sm text-zinc-200">
        {t("deletedTitle")}
        {named ? ` · ${t(`kinds.${kind}`)}` : ""}
      </summary>
      <div className="mt-3 grid gap-2">
        <p className="text-xs text-zinc-400">{t("deletedLead")}</p>
        {h.phase === "loading" && <p className="text-sm text-zinc-400">{t("loading")}</p>}
        {h.phase === "error" && <p className="text-sm text-amber-200">{t("error")}</p>}
        {h.phase === "ok" && !h.items.length && <p className="text-sm text-zinc-400">{t("deletedNone")}</p>}
        <ul className="grid gap-2">
          {h.items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
              <span className="grid gap-0.5 text-sm">
                <span className="text-zinc-100">{recordLabel(kind, d.data)}</span>
                <span className="font-mono text-xs text-zinc-400">
                  {t("deletedOn", { date: when(d.deletedAt) })} · {d.by.replace(/ \(borrado\)$/, "") || t("anon")}
                </span>
              </span>
              {back.includes(d.id) ? (
                <span role="status" className="text-xs text-emerald-300">
                  {t("back")}
                </span>
              ) : (
                <button type="button" className={SMALL} onClick={() => restoreRecord(kind, d.data) && setBack([...back, d.id])}>
                  {t("restore")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
