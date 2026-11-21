"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { TextField } from "@/components/mikrotik/TextField"
import { PickField } from "@/components/surveys/SurveyFields"
import { DANGER, PRIMARY, SMALL } from "@/components/finance/FinParts"
import { siteLabel } from "@/lib/sites/model"
import { readState } from "@/lib/sync/state"
import type { Desired, Diff, Unmanaged } from "@/lib/wispdavor/routers"
import { useWispData } from "./useWispData"

type T = ReturnType<typeof useTranslations>
type ActionRow = { id: string; kind: string; user: string; arg1: string; source: string; status: string; result: string; created_at: string; created_by: string }
type RouterRow = { id: string; siteId: string; name: string; pppoe: boolean; hotspot: boolean; auto: boolean; lastSeenAt: string; online: boolean; users: number; changes: Diff[]; missing: Desired[]; unmanaged: Unmanaged[]; actions: ActionRow[] }

const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const STATUS_TONE: Record<string, string> = { done: "text-emerald-300", error: "text-red-300", sent: "text-amber-200", pending: "text-zinc-300" }

/** /interno/software/wispdavor/routers: the routers, their state, differences with Clientes, actions and the agent script. */
export function RoutersApp() {
  const t = useTranslations("wispdavor.routers")
  const d = useWispData()
  const [rows, setRows] = useState<RouterRow[] | null>(null)
  const [error, setError] = useState(false)
  const [script, setScript] = useState<{ id: string; text: string } | null>(null)
  const [msg, setMsg] = useState("")
  const [form, setForm] = useState({ name: "", siteId: "", pppoe: true, hotspot: false })
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/routers", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      setRows(((await r.json()) as { routers: RouterRow[] }).routers)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the routers once from the server when the page opens
    void load()
  }, [load])
  if (!d.loaded) return null
  const post = async (body: object) => {
    const r = await fetch("/api/interno/routers", { method: "POST", headers: headers(), body: JSON.stringify(body) }).catch(() => null)
    if (!r?.ok) {
      setError(true)
      return null
    }
    setError(false)
    return (await r.json()) as Record<string, unknown>
  }
  const create = async () => {
    if (!form.name.trim()) return
    const b = await post({ action: "create", ...form })
    if (b) {
      setScript({ id: String((b.router as { id: string }).id), text: String(b.script) })
      setForm({ name: "", siteId: "", pppoe: true, hotspot: false })
      await load()
    }
  }
  const siteName = (id: string) => {
    const s = d.sites.find((x) => x.id === id)
    return s ? siteLabel(s) : t("noSite")
  }
  return (
    <div className="mt-6 grid gap-8">
      <div className="grid gap-2 text-sm text-zinc-300">
        <p>{t("lead")}</p>
        <p className="text-xs text-zinc-400">{t("desired")}</p>
        <p className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-100">{t("verify")}</p>
        <p className="text-xs text-zinc-400">{t("neon")}</p>
      </div>
      {error && <p className="text-xs text-amber-200">{t("error")}</p>}
      {msg && (
        <p role="status" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-100">
          {msg}
        </p>
      )}
      <section aria-labelledby="wd-r-add" className="grid gap-3 rounded-2xl border border-white/10 p-4">
        <h2 id="wd-r-add" className="text-lg font-light text-foreground">
          {t("add")}
        </h2>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TextField label={t("name")} value={form.name} onChange={(name) => setForm((f) => ({ ...f, name: name.slice(0, 60) }))} />
          <PickField label={t("site")} value={form.siteId} onChange={(siteId) => setForm((f) => ({ ...f, siteId }))} options={[{ value: "", label: t("noSite") }, ...d.sites.map((s) => ({ value: s.id, label: siteLabel(s) }))]} />
        </div>
        <fieldset className="flex flex-wrap gap-4 text-sm text-zinc-200">
          <legend className="mb-1 font-mono text-xs text-zinc-300">{t("roles")}</legend>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={form.pppoe} onChange={(e) => setForm((f) => ({ ...f, pppoe: e.target.checked }))} className="size-5 accent-white" />
            {t("pppoe")}
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={form.hotspot} onChange={(e) => setForm((f) => ({ ...f, hotspot: e.target.checked }))} className="size-5 accent-white" />
            {t("hotspot")}
          </label>
        </fieldset>
        <button type="button" disabled={!form.name.trim()} onClick={create} className={`${PRIMARY} disabled:opacity-40`}>
          {t("create")}
        </button>
      </section>
      {rows && !rows.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      <ul className="grid gap-4">
        {rows?.map((r) => (
          <li key={r.id}>
            <RouterCard t={t} r={r} siteName={siteName(r.siteId)} sites={d.sites.map((s) => ({ value: s.id, label: siteLabel(s) }))} script={script?.id === r.id ? script.text : ""} post={post} reload={load} setScript={(text) => setScript({ id: r.id, text })} setMsg={setMsg} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RouterCard({
  t,
  r,
  siteName,
  sites,
  script,
  post,
  reload,
  setScript,
  setMsg,
}: {
  t: T
  r: RouterRow
  siteName: string
  sites: { value: string; label: string }[]
  script: string
  post: (b: object) => Promise<Record<string, unknown> | null>
  reload: () => Promise<void>
  setScript: (text: string) => void
  setMsg: (m: string) => void
}) {
  const online = r.online
  // The one-time password of a user just created on this router, shown here (with copy) until the page reloads.
  const [created, setCreated] = useState<{ user: string; password: string } | null>(null)
  const when = r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : ""
  return (
    <div className="grid gap-4 rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg text-zinc-100">
          {r.name} <span className="text-sm text-zinc-400">· {siteName}</span>
        </span>
        <span className={`text-xs ${online ? "text-emerald-300" : "text-amber-200"}`}>
          {r.lastSeenAt ? `${online ? t("online") : t("offline")} · ${t("lastSeen", { when })}` : t("never")}
        </span>
      </div>
      <p className="font-mono text-xs text-zinc-400">{[r.pppoe ? t("pppoe") : "", r.hotspot ? t("hotspot") : "", t("users", { n: r.users })].filter(Boolean).join(" · ")}</p>
      {r.pppoe && !r.siteId && <p className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-100">{t("noSiteWarn")}</p>}
      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer text-sm text-zinc-200">{t("edit")}</summary>
        <div className="mt-3 grid gap-3">
          <PickField
            label={t("site")}
            value={r.siteId}
            onChange={async (siteId) => {
              await post({ action: "update", id: r.id, siteId })
              await reload()
            }}
            options={[{ value: "", label: t("noSite") }, ...sites]}
          />
          <div className="flex flex-wrap gap-4 text-sm text-zinc-200">
            {(["pppoe", "hotspot"] as const).map((k) => (
              <label key={k} className="flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  checked={r[k]}
                  onChange={async (e) => {
                    await post({ action: "update", id: r.id, [k]: e.target.checked })
                    await reload()
                  }}
                  className="size-5 accent-white"
                />
                {t(k)}
              </label>
            ))}
          </div>
        </div>
      </details>
      {r.pppoe && (
        <div className="grid gap-1">
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={r.auto}
            onChange={async (e) => {
              await post({ action: "update", id: r.id, auto: e.target.checked })
              await reload()
            }}
            className="size-5 accent-white"
          />
          {t("auto")}
        </label>
        <p className="text-xs text-zinc-400">{t("autoHint")}</p>
        </div>
      )}
      {/* Without a deployment there's nothing to compare (the warning above says so). */}
      {r.pppoe && r.siteId && (
        <section aria-label={t("changes", { n: r.changes.length })} className="grid gap-2">
          <h3 className="text-sm font-medium text-zinc-200">{t("changes", { n: r.changes.length })}</h3>
          {/* Before its first report the router's state is unknown: "the same as Clientes" would be wrong. */}
          {!r.changes.length && <p className="text-xs text-zinc-400">{r.lastSeenAt ? t("noChanges") : t("waiting")}</p>}
          <ul className="grid gap-1 font-mono text-xs text-zinc-300">
            {r.changes.slice(0, 50).map((c) => (
              <li key={`${c.kind}-${c.user}`}>{t(`change.${c.kind}`, { user: c.user, profile: c.profile })}</li>
            ))}
          </ul>
          {r.changes.length > 0 && !r.auto && (
            <button
              type="button"
              onClick={async () => {
                const b = await post({ action: "send", id: r.id })
                if (b) setMsg(t("sent", { n: Number(b.queued ?? 0) }))
                await reload()
              }}
              className={SMALL}
            >
              {t("send")}
            </button>
          )}
        </section>
      )}
      {r.pppoe && r.missing.length > 0 && (
        <section aria-label={t("missing", { n: r.missing.length })} className="grid gap-2">
          <h3 className="text-sm font-medium text-zinc-200">{t("missing", { n: r.missing.length })}</h3>
          <p className="text-xs text-zinc-400">{t("missingHint")}</p>
          <ul className="grid gap-1.5">
            {r.missing.slice(0, 50).map((m) => (
              <li key={m.user} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-zinc-300">
                  {m.user} · {m.plan}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const b = await post({ action: "createUser", id: r.id, user: m.user, profile: m.profile, clientId: m.clientId, serviceId: m.serviceId })
                    if (b) setCreated({ user: String(b.user), password: String(b.password) })
                    await reload()
                  }}
                  className={SMALL}
                >
                  {t("createUser")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {created && (
        <div role="status" className="grid gap-2 rounded-xl border border-amber-400/40 p-3">
          <p className="text-sm text-amber-100">{t("password", { user: created.user, password: created.password })}</p>
          <CopyButton text={created.password} label={t("copy")} done={t("copied")} />
        </div>
      )}
      {r.pppoe && r.unmanaged.length > 0 && (
        <section aria-label={t("unmanaged", { n: r.unmanaged.length })} className="grid gap-1">
          <h3 className="text-sm font-medium text-zinc-200">{t("unmanaged", { n: r.unmanaged.length })}</h3>
          <ul className="grid gap-1 text-xs text-amber-200">
            {r.unmanaged.slice(0, 50).map((u) => (
              <li key={`${u.clientId}-${u.user}`}>
                <a href={`/interno/admin/clientes?c=${u.clientId}`} className="underline decoration-amber-200/30 underline-offset-4">
                  {u.user}
                </a>{" "}
                · {t(`unmanagedReason.${u.reason}`)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer text-sm text-zinc-200">{t("actions")}</summary>
        {!r.actions.length && <p className="mt-2 text-xs text-zinc-400">{t("noActions")}</p>}
        <ul className="mt-2 grid gap-1 font-mono text-xs text-zinc-300">
          {r.actions.map((a) => (
            <li key={a.id}>
              {a.created_at.slice(0, 16).replace("T", " ")} · {t.has(`kinds.${a.kind}`) ? t(`kinds.${a.kind}`) : a.kind} {a.user} {a.arg1} · <span className={STATUS_TONE[a.status] ?? ""}>{t.has(`status.${a.status}`) ? t(`status.${a.status}`) : a.status}</span> · {t.has(`source.${a.source}`) ? t(`source.${a.source}`) : a.source}
              {a.result ? ` · ${a.result}` : ""}
            </li>
          ))}
        </ul>
      </details>
      {script && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-200">{t("script")}</p>
            <CopyButton text={script} label={t("copy")} done={t("copied")} />
          </div>
          <p className="text-xs text-amber-100">{t("scriptHint")}</p>
          <pre tabIndex={0} className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre text-zinc-100">
            <code>{script}</code>
          </pre>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(t("confirmRotate", { name: r.name }))) return
            const b = await post({ action: "rotate", id: r.id })
            if (b) setScript(String(b.script))
          }}
          className={SMALL}
        >
          {t("rotate")}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(t("confirmRemove", { name: r.name }))) return
            await post({ action: "delete", id: r.id })
            await reload()
          }}
          className={DANGER}
        >
          {t("remove")}
        </button>
      </div>
    </div>
  )
}
