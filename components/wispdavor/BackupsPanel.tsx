"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { SMALL } from "@/components/finance/FinParts"
import { readState } from "@/lib/sync/state"
import { diffConfigs } from "@/lib/wispdavor/backups"

type Backup = { id: string; at: string; by: string; size: number; source: string; checkedAt: string }
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const when = (t: string) => new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const SHOW = 200

/**
 * A router's configuration copies (phase 7): the daily copy and the ones asked for ("Respaldar ahora": the router sends it
 * at its next report), each to download, and what changed against the copy before it.
 */
export function BackupsPanel({ routerId, pollMinutes }: { routerId: string; pollMinutes: number }) {
  const t = useTranslations("wispdavor.backups")
  const [list, setList] = useState<Backup[] | null>(null)
  const [lastAsk, setLastAsk] = useState<{ status: string; at: string; result: string } | null>(null)
  const [msg, setMsg] = useState("")
  const [diff, setDiff] = useState<{ id: string; added: string[]; removed: string[] } | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/routers/rest", { method: "POST", headers: headers(), body: JSON.stringify({ action: "backups", id: routerId }) })
      const b = (await r.json()) as { backups?: Backup[]; ask?: { status: string; at: string; result: string } | null }
      setList(b.backups ?? [])
      setLastAsk(b.ask ?? null)
    } catch {
      setMsg(t("offline"))
    }
  }, [routerId, t])
  const ask = async () => {
    const r = await fetch("/api/interno/routers", { method: "POST", headers: headers(), body: JSON.stringify({ action: "backup", id: routerId }) }).catch(() => null)
    setMsg(r?.ok ? t("asked", { m: pollMinutes }) : t("offline"))
    if (r?.ok) void load()
  }
  const text = async (id: string) => {
    const r = await fetch(`/api/interno/routers/rest?respaldo=${id}`, { cache: "no-store" })
    if (!r.ok) throw new Error(String(r.status))
    return r.text()
  }
  const compare = async (i: number) => {
    if (!list) return
    const cur = list[i]
    const prev = list[i + 1]
    if (!prev) return
    try {
      const [a, b] = await Promise.all([text(prev.id), text(cur.id)])
      setDiff({ id: cur.id, ...diffConfigs(a, b) })
    } catch {
      setMsg(t("offline"))
    }
  }
  return (
    <details className="rounded-xl border border-white/10 p-3" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && list === null && void load()}>
      <summary className="cursor-pointer text-sm text-zinc-200">{t("title")}</summary>
      <div className="mt-3 grid gap-3">
        <p className="text-xs text-zinc-400">{t("lead")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void ask()} className={SMALL}>
            {t("now")}
          </button>
          <button type="button" onClick={() => void load()} className={SMALL}>
            {t("refresh")}
          </button>
        </div>
        {msg && (
          <p role="status" className="text-xs text-zinc-200">
            {msg}
          </p>
        )}
        {lastAsk && lastAsk.status !== "done" && (
          <p className={`text-xs ${lastAsk.status === "pending" || lastAsk.status === "sent" ? "text-zinc-300" : "text-amber-200"}`}>
            {t(`ask.${lastAsk.status === "pending" || lastAsk.status === "sent" ? "waiting" : lastAsk.status === "missing" ? "missing" : "error"}`, { date: when(lastAsk.at), result: lastAsk.result || "—" })}
          </p>
        )}
        {list && !list.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
        <ul className="grid gap-2">
          {(list ?? []).map((b, i) => (
            <li key={b.id} className="grid gap-1 rounded-lg border border-white/10 p-2 text-sm">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={`/api/interno/routers/rest?respaldo=${b.id}`} className="text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-white">
                  {when(b.at)}
                </a>
                <span className="font-mono text-xs text-zinc-400">{[`${Math.max(1, Math.round(b.size / 1024))} KB`, t(`source.${b.source === "agente" ? "agente" : "rest"}`), b.by].filter(Boolean).join(" · ")}</span>
              </span>
              {b.checkedAt && <span className="text-xs text-emerald-300">{t("same", { date: when(b.checkedAt) })}</span>}
              {list && list[i + 1] && (
                <button type="button" onClick={() => void compare(i)} className="w-fit text-xs text-zinc-300 underline underline-offset-4">
                  {t("compare")}
                </button>
              )}
              {diff?.id === b.id && (
                <div className="grid gap-1">
                  {!diff.added.length && !diff.removed.length && <p className="text-xs text-zinc-400">{t("noDiff")}</p>}
                  <pre tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[0.7rem] leading-relaxed whitespace-pre">
                    {diff.removed.slice(0, SHOW).map((l, k) => (
                      <span key={`r${k}`} className="block text-red-300">{`− ${l}`}</span>
                    ))}
                    {diff.added.slice(0, SHOW).map((l, k) => (
                      <span key={`a${k}`} className="block text-emerald-300">{`+ ${l}`}</span>
                    ))}
                  </pre>
                  {(diff.added.length > SHOW || diff.removed.length > SHOW) && <p className="text-xs text-zinc-400">{t("more")}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
