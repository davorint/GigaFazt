"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { TextField } from "@/components/mikrotik/TextField"
import { SMALL } from "@/components/finance/FinParts"
import { readState } from "@/lib/sync/state"
import { setupCommands } from "@/lib/wispdavor/rest"
import type { RestView } from "@/lib/wispdavor/rest-server"

const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })

/** A router's REST connection (owner, 2026-11-21): address, users, certificate, and the "Solo lectura" switch. */
export function RestPanel({ routerId }: { routerId: string }) {
  const t = useTranslations("wispdavor.rest")
  const [view, setView] = useState<RestView | null>(null)
  const [keySet, setKeySet] = useState(true)
  const [form, setForm] = useState({ host: "", port: "8443", readUser: "", readPass: "", writeUser: "", writePass: "", fingerprint: "" })
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/routers/rest", { cache: "no-store" })
      if (!r.ok) return
      const b = (await r.json()) as { keySet: boolean; rest: Record<string, RestView> }
      setKeySet(b.keySet)
      const v = b.rest[routerId] ?? null
      setView(v)
      if (v) setForm((f) => ({ ...f, host: v.host, port: String(v.port), readUser: v.readUser, writeUser: v.writeUser, fingerprint: v.fingerprint, readPass: "", writePass: "" }))
    } catch {
      setMsg(t("errors.offline"))
    }
  }, [routerId, t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads this router's REST settings once
    void load()
  }, [load])
  const post = async (body: object) => {
    setBusy(true)
    setMsg("")
    try {
      const r = await fetch("/api/interno/routers/rest", { method: "POST", headers: headers(), body: JSON.stringify({ id: routerId, ...body }) })
      const b = (await r.json().catch(() => ({}))) as { error?: string; detail?: string; version?: string; board?: string }
      if (!r.ok) setMsg(t.has(`errors.${b.error}`) ? `${t(`errors.${b.error}`)}${b.detail ? ` (${b.detail})` : ""}` : `${b.error ?? r.status}`)
      return r.ok ? b : null
    } catch {
      setMsg(t("errors.offline"))
      return null
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const ok = await post({ action: "save", host: form.host, port: Number(form.port) || 443, readUser: form.readUser, readPass: form.readPass, writeUser: form.writeUser, writePass: form.writePass, fingerprint: form.fingerprint })
    if (ok) {
      setMsg(t("saved"))
      await load()
    }
  }
  const setReadOnly = async (readOnly: boolean) => {
    if (!readOnly && !window.confirm(t("confirmWrite"))) return
    if (await post({ action: "save", readOnly })) await load()
  }
  const test = async () => {
    const b = await post({ action: "test" })
    if (b) setMsg(t("testOk", { board: b.board ?? "", version: b.version ?? "" }))
  }
  const readOnly = view?.readOnly ?? true
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <details className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer text-sm text-zinc-200">
        {t("title")} <span className={`ml-2 font-mono text-xs ${readOnly ? "text-emerald-300" : "text-amber-200"}`}>{view?.host ? (readOnly ? t("badgeRead") : t("badgeWrite")) : t("badgeOff")}</span>
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="text-xs text-zinc-400">{t("lead")}</p>
        {!keySet && <p className="text-xs text-amber-200">{t("noKey")}</p>}
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-100">
          <input type="checkbox" checked={readOnly} disabled={busy || !view} onChange={(e) => void setReadOnly(e.target.checked)} className="size-5 accent-white" />
          {t("readOnly")}
        </label>
        <p className="text-xs text-zinc-400">{readOnly ? t("readOnlyOn") : t("readOnlyOff")}</p>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TextField label={t("host")} value={form.host} onChange={set("host")} hint={t("hostHint")} />
          <TextField label={t("port")} value={form.port} onChange={(v) => set("port")(v.replace(/\D/g, "").slice(0, 5))} />
          <TextField label={t("readUser")} value={form.readUser} onChange={set("readUser")} />
          <TextField type="password" label={t("readPass")} value={form.readPass} onChange={set("readPass")} hint={view?.hasReadPass ? t("passKept") : ""} />
          <TextField label={t("writeUser")} value={form.writeUser} onChange={set("writeUser")} hint={t("writeHint")} />
          <TextField type="password" label={t("writePass")} value={form.writePass} onChange={set("writePass")} hint={view?.hasWritePass ? t("passKept") : ""} />
        </div>
        <TextField label={t("fingerprint")} value={form.fingerprint} onChange={set("fingerprint")} hint={t("fingerprintHint")} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className={SMALL}>
            {t("save")}
          </button>
          <button type="button" disabled={busy || !view?.host} onClick={() => void test()} className={SMALL}>
            {busy ? t("testing") : t("test")}
          </button>
          {view?.writeUser && (
            <button type="button" disabled={busy} onClick={() => void post({ action: "save", clearWrite: true }).then((ok) => ok && load())} className={SMALL}>
              {t("clearWrite")}
            </button>
          )}
        </div>
        {msg && (
          <p role="status" className="text-sm text-zinc-200">
            {msg}
          </p>
        )}
        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-xs text-zinc-300">{t("setup")}</summary>
          <div className="mt-2 grid gap-2">
            <CopyButton text={setupCommands({ port: Number(form.port) || 8443, dnsName: form.host })} label={t("copy")} done={t("copied")} />
            <pre tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs whitespace-pre text-zinc-100">
              <code>{setupCommands({ port: Number(form.port) || 8443, dnsName: form.host })}</code>
            </pre>
          </div>
        </details>
      </div>
    </details>
  )
}
