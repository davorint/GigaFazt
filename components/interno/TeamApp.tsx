"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"

type Member = { id: string; name: string; admin: boolean; active: boolean; createdAt: string }
type State = { members: Member[]; me: string | null; admin: boolean; accounts: boolean }

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
const PRIMARY = "h-10 w-fit rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
const INPUT = "h-10 rounded-md border border-input bg-white/[0.03] px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"

async function call(method: "GET" | "POST" | "PATCH", body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch("/api/interno/equipo", { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
  return { ok: r.ok, status: r.status, data: ((await r.json().catch(() => ({}))) as Record<string, unknown>) ?? {} }
}

function Field({ label, type = "text", value, onChange, autoComplete }: { label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <input id={id} type={type} value={value} maxLength={type === "password" ? 200 : 40} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </div>
  )
}

/** /interno/admin/usuarios (Usuarios y accesos): the team accounts (needs a connection: they live only in the database, never on the phone). */
export function TeamApp() {
  const t = useTranslations("equipo")
  const [st, setSt] = useState<State | null>(null)
  const [load, setLoad] = useState<"loading" | "ok" | "offline" | "error" | "signin">("loading")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return setLoad("offline")
    const r = await call("GET").catch(() => null)
    if (!r) return setLoad("error")
    if (r.status === 401) return setLoad("signin")
    if (!r.ok) return setLoad("error")
    setSt(r.data as unknown as State)
    setLoad("ok")
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list once (external data, set when it arrives)
  useEffect(() => void refresh(), [refresh])
  const err = (data: Record<string, unknown>) => t(`errors.${typeof data.error === "string" ? data.error : "server"}`)

  if (load !== "ok" || !st) return <p className="mt-6 text-sm text-zinc-400">{t(`load.${load}`)}</p>
  const create = async (name: string, password: string, admin: boolean) => {
    const r = await call("POST", { name, password, admin })
    if (!r.ok) return setMsg({ ok: false, text: err(r.data) }), false
    setMsg({ ok: true, text: st.accounts ? t("added", { name }) : t("firstAdded", { name }) })
    await refresh()
    return true
  }
  const patch = async (id: string, p: { password?: string; active?: boolean; admin?: boolean }, done: string) => {
    const r = await call("PATCH", { id, ...p })
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: err(r.data) })
    if (r.ok) await refresh()
    return r.ok
  }
  return (
    <div className="mt-6 grid gap-6">
      {!st.accounts && <p className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-100">{t("noAccounts")}</p>}
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text}{" "}
          {msg.ok && !st.members.some((m) => m.id === st.me) && st.accounts && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- the sign-in page: a full load
            <a href="/interno/entrar" className="underline underline-offset-4">
              {t("signInNow")}
            </a>
          )}
        </p>
      )}
      {(st.admin || !st.accounts) && <AddForm t={t} first={!st.accounts} onAdd={create} />}
      <ul className="grid gap-2">
        {st.members.map((m) => (
          <li key={m.id}>
            <MemberRow t={t} m={m} me={st.me === m.id} admin={st.admin} onPatch={patch} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddForm({ t, first, onAdd }: { t: ReturnType<typeof useTranslations>; first: boolean; onAdd: (name: string, password: string, admin: boolean) => Promise<boolean> }) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [admin, setAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-3 rounded-xl border border-white/15 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        if (await onAdd(name, password, first || admin)) {
          setName("")
          setPassword("")
          setAdmin(false)
        }
        setBusy(false)
      }}
    >
      <p className="text-sm font-medium text-foreground">{first ? t("firstTitle") : t("addTitle")}</p>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label={t("name")} value={name} onChange={setName} autoComplete="off" />
        <Field label={t("password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      </div>
      <p className="text-xs text-zinc-400">{t("passwordHint")}</p>
      {!first && (
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} className="size-5 accent-white" />
          {t("adminCheck")}
        </label>
      )}
      <button type="submit" disabled={busy} className={PRIMARY}>
        {first ? t("firstSubmit") : t("addSubmit")}
      </button>
    </form>
  )
}

function MemberRow({ t, m, me, admin, onPatch }: { t: ReturnType<typeof useTranslations>; m: Member; me: boolean; admin: boolean; onPatch: (id: string, p: { password?: string; active?: boolean; admin?: boolean }, done: string) => Promise<boolean> }) {
  const [pw, setPw] = useState<string | null>(null)
  return (
    <div className={`grid gap-3 rounded-xl border p-3 ${m.active ? "border-white/10" : "border-white/5 opacity-60"}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
        {m.name}
        {me && <span className="text-xs text-cyan-200">{t("you")}</span>}
        {m.admin && <span className="rounded-full border border-violet-400/40 px-2 py-0.5 text-xs text-violet-200">{t("adminBadge")}</span>}
        {!m.active && <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-zinc-400">{t("inactive")}</span>}
      </p>
      {pw !== null ? (
        <form
          className="grid gap-2 sm:max-w-sm"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await onPatch(m.id, { password: pw }, t("passwordChanged", { name: m.name }))) setPw(null)
          }}
        >
          <Field label={t("newPassword")} type="password" value={pw} onChange={setPw} autoComplete="new-password" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={SMALL}>
              {t("savePassword")}
            </button>
            <button type="button" onClick={() => setPw(null)} className={SMALL}>
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(admin || me) && (
            <button type="button" onClick={() => setPw("")} className={SMALL}>
              {me ? t("changeMine") : t("resetPassword")}
            </button>
          )}
          {admin && !me && (
            <button type="button" onClick={() => void onPatch(m.id, { active: !m.active }, m.active ? t("deactivated", { name: m.name }) : t("activated", { name: m.name }))} className={SMALL}>
              {m.active ? t("deactivate") : t("activate")}
            </button>
          )}
          {admin && !me && m.active && (
            <button type="button" onClick={() => void onPatch(m.id, { admin: !m.admin }, m.admin ? t("adminRemoved", { name: m.name }) : t("adminGiven", { name: m.name }))} className={SMALL}>
              {m.admin ? t("removeAdmin") : t("makeAdmin")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
