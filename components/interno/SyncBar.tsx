"use client"

import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { discardLocal, localIds, startSync, subscribeSync, syncNow, syncServerSnapshot, syncSnapshot } from "@/lib/sync/engine"
import { adoptLocal, readState, setName } from "@/lib/sync/state"

const TONE: Record<string, string> = {
  idle: "border-emerald-400/40 text-emerald-300",
  syncing: "border-cyan-400/40 text-cyan-200",
  offline: "border-amber-400/40 text-amber-200",
  error: "border-red-400/40 text-red-300",
  "no-name": "border-amber-400/40 text-amber-200",
  "no-database": "border-red-400/40 text-red-300",
  signin: "border-red-400/40 text-red-300",
}
const BTN = "min-h-9 rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/**
 * Syncing on the pages that use the database (Levantamientos, Materiales, Proveedores): asks who you are once, shows
 * whether everything is sent, and offers the one-time upload of what this browser had before the database.
 */
export function SyncBar() {
  const t = useTranslations("sync")
  const s = useSyncExternalStore(subscribeSync, syncSnapshot, syncServerSnapshot)
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  useEffect(() => startSync(), [])
  // With a team account the name comes from it (lib/team): set once, not editable here.
  const [account, setAccount] = useState(false)
  useEffect(() => {
    let alive = true
    fetch("/api/interno/yo")
      .then((r) => (r.ok ? (r.json() as Promise<{ member: { name: string } | null }>) : null))
      .then((v) => {
        if (!alive || !v?.member) return
        setAccount(true)
        if (readState().name !== v.member.name) {
          setName(v.member.name)
          void syncNow()
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  const askName = !account && (!s.name || editing)
  const save = () => {
    if (!draft.trim()) return
    setName(draft)
    setEditing(false)
    void syncNow()
  }
  return (
    <section aria-label={t("label")} className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      {askName ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <p className="text-sm font-medium text-foreground">{t("whoTitle")}</p>
          <p className="text-xs leading-snug text-zinc-400">{t("whoHint")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1">
              <label htmlFor={id} className="font-mono text-xs text-zinc-300">
                {t("whoLabel")}
              </label>
              <input
                id={id}
                value={draft}
                maxLength={40}
                autoComplete="name"
                onChange={(e) => setDraft(e.target.value)}
                className="h-10 rounded-md border border-input bg-white/[0.03] px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>
            <button type="submit" className="h-10 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {t("save")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className={`rounded-full border px-2.5 py-1 text-xs ${TONE[s.phase] ?? TONE.idle}`}>{t(`phase.${s.phase}`)}</span>
          {s.pending > 0 && <span className="font-mono text-xs text-zinc-300">{t("pending", { n: s.pending })}</span>}
          {s.lastOk && <span className="font-mono text-xs text-zinc-400">{t("last", { time: new Date(s.lastOk).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) })}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-300">{t("you", { name: s.name })}</span>
            {!account && (
              <button
                type="button"
                className={BTN}
                onClick={() => {
                  setDraft(s.name)
                  setEditing(true)
                }}
              >
                {t("change")}
              </button>
            )}
            <button type="button" className={BTN} onClick={() => void syncNow()} disabled={s.phase === "syncing"}>
              {t("now")}
            </button>
          </span>
        </div>
      )}
      {s.phase === "signin" && (
        <p role="alert" className="text-sm text-red-200">
          {t("signinHint")}{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the sign-in page: a full load */}
          <a href="/interno/entrar" className="underline underline-offset-4">
            {t("signinLink")}
          </a>
        </p>
      )}
      {!askName && s.rejected.length > 0 && (
        <div role="alert" className="grid gap-2 rounded-lg border border-red-400/30 p-3">
          <p className="text-sm text-red-200">{t("rejected.title", { n: s.rejected.length })}</p>
          <p className="text-xs leading-snug text-zinc-300">{t("rejected.hint")}</p>
          <ul className="grid gap-2">
            {s.rejected.map((r) => {
              const name = r.label || t("rejected.noName")
              const why = r.reason === "bad-id" || r.reason === "bad-data" ? t(`rejected.reasons.${r.reason}`) : t("rejected.reasons.other", { detail: r.reason || "—" })
              return (
                <li key={`${r.kind}:${r.id}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-200">
                    {t(`rejected.kinds.${r.kind}`)} · {name} <span className="text-zinc-400">· {why}</span>
                  </span>
                  <button type="button" className={BTN} onClick={() => window.confirm(t("rejected.confirm", { name })) && discardLocal(r.kind, r.id)}>
                    {t("rejected.discard")}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {!askName && !s.adopted && s.unsent > 0 && (
        <div className="grid gap-2 rounded-lg border border-amber-400/30 p-3">
          <p className="text-sm text-amber-100">{t("uploadTitle", { n: s.unsent })}</p>
          <p className="text-xs leading-snug text-zinc-300">{t("uploadHint")}</p>
          <button
            type="button"
            className="h-10 w-fit rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => {
              if (!window.confirm(t("confirmUpload", { n: s.unsent }))) return
              adoptLocal(localIds())
              void syncNow()
            }}
          >
            {t("upload")}
          </button>
        </div>
      )}
    </section>
  )
}
