"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import { TextField } from "@/components/mikrotik/TextField"
import { DANGER, SMALL } from "@/components/finance/FinParts"
import { clientLabel } from "@/lib/clients/model"
import { readState } from "@/lib/sync/state"
import { bps } from "@/lib/wispdavor/rest"
import type { ClientLive, LiveView, RestAction, RestView } from "@/lib/wispdavor/rest-server"
import { useWispData } from "./useWispData"

type Routers = { id: string; name: string }[]
type Backup = { id: string; at: string; by: string; size: number }
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const when = (t: string) => new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const mb = (n: number) => `${Math.round(n / 1048576)} MB`

/**
 * /interno/software/wispdavor/envivo (owner, 2026-11-21: REST): one router at a time, over its REST API: resources,
 * interfaces with live rates, PPPoE sessions and the log; a client's session with staff actions (only when the router
 * isn't in read-only mode); configuration backups.
 */
export function LiveApp() {
  const t = useTranslations("wispdavor.envivo")
  const tr = useTranslations("wispdavor.rest")
  const d = useWispData()
  const [routers, setRouters] = useState<Routers | null>(null)
  const [rest, setRest] = useState<Record<string, RestView>>({})
  const [id, setId] = useState("")
  const [live, setLive] = useState<LiveView | null>(null)
  const [auto, setAuto] = useState(false)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState("")
  const [client, setClient] = useState<ClientLive | null>(null)
  const [plan, setPlan] = useState("")
  const [backups, setBackups] = useState<Backup[] | null>(null)
  const [q, setQ] = useState("")
  useEffect(() => {
    void (async () => {
      try {
        const [a, b] = await Promise.all([fetch("/api/interno/routers?basico=1", { cache: "no-store" }), fetch("/api/interno/routers/rest", { cache: "no-store" })])
        const ra = (await a.json()) as { routers: Routers }
        const rb = (await b.json()) as { rest: Record<string, RestView> }
        setRest(rb.rest ?? {})
        const usable = (ra.routers ?? []).filter((r) => rb.rest?.[r.id]?.host)
        setRouters(usable)
        if (usable[0]) setId((x) => x || usable[0].id)
      } catch {
        setMsg(tr("errors.offline"))
        setRouters([])
      }
    })()
  }, [tr])
  const post = useCallback(
    async <T,>(body: object): Promise<T | null> => {
      setMsg("")
      try {
        const r = await fetch("/api/interno/routers/rest", { method: "POST", headers: headers(), body: JSON.stringify({ id, ...body }) })
        const b = (await r.json().catch(() => ({}))) as T & { error?: string; detail?: string }
        if (!r.ok) {
          setMsg(tr.has(`errors.${b.error}`) ? `${tr(`errors.${b.error}`)}${b.detail ? ` (${b.detail})` : ""}` : String(b.error ?? r.status))
          return null
        }
        return b
      } catch {
        setMsg(tr("errors.offline"))
        return null
      }
    },
    [id, tr]
  )
  const refresh = useCallback(async () => {
    if (!id) return
    setBusy(true)
    const b = await post<{ live: LiveView }>({ action: "live" })
    setLive(b?.live ?? null)
    setBusy(false)
  }, [id, post])
  const loadBackups = useCallback(async () => {
    if (!id) return
    const b = await post<{ backups: Backup[] }>({ action: "backups" })
    setBackups(b?.backups ?? [])
  }, [id, post])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a router chosen: its live view and backups
    setLive(null)
    setClient(null)
    void refresh()
    void loadBackups()
  }, [refresh, loadBackups])
  useEffect(() => {
    if (!auto) return
    const h = window.setInterval(() => void refresh(), 15000)
    return () => window.clearInterval(h)
  }, [auto, refresh])
  const users = useMemo(
    () => d.clients.flatMap((c) => c.services.filter((s) => s.type === "internet" && s.pppoeUser.trim()).map((s) => ({ value: s.pppoeUser.trim(), label: `${clientLabel(c)} · ${s.pppoeUser.trim()}`, plan: s.plan.trim() }))),
    [d.clients]
  )
  const lookup = async (u: string) => {
    setUser(u)
    setClient(null)
    if (!u) return
    setBusy(true)
    const b = await post<{ client: ClientLive }>({ action: "client", user: u })
    setClient(b?.client ?? null)
    setPlan(users.find((x) => x.value === u)?.plan ?? "")
    setBusy(false)
  }
  const act = async (a: RestAction, arg = "") => {
    if (!window.confirm(t("confirmAct", { action: t(`acts.${a}`), user }))) return
    setBusy(true)
    const b = await post<{ done: string }>({ action: "act", act: a, user, arg })
    setBusy(false)
    if (b) {
      setMsg(t("actDone", { action: t(`acts.${a}`), user }))
      await lookup(user)
    }
  }
  const backup = async () => {
    setBusy(true)
    const b = await post<{ backup: { size: number } }>({ action: "backup" })
    setBusy(false)
    if (b) {
      setMsg(t("backupDone", { kb: Math.max(1, Math.round(b.backup.size / 1024)) }))
      await loadBackups()
    }
  }
  if (routers === null) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>
  const cfg = rest[id]
  const readOnly = cfg?.readOnly ?? true
  const canWrite = !readOnly && !!cfg?.writeUser
  const sessions = (live?.sessions ?? []).filter((s) => !q.trim() || `${s.name} ${s.address} ${s.callerId}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {!routers.length ? (
        <p className="text-sm text-amber-200">{t("none")}</p>
      ) : (
        <>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
            <PickField label={t("router")} value={id} onChange={setId} options={routers.map((r) => ({ value: r.id, label: r.name }))} />
            <button type="button" disabled={busy} onClick={() => void refresh()} className={SMALL}>
              {busy ? t("loadingShort") : t("refresh")}
            </button>
            <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-5 accent-white" />
              {t("auto")}
            </label>
          </div>
          <p className={`rounded-lg border px-3 py-2 text-xs ${readOnly ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/40 text-amber-100"}`}>{`${t(`via.${cfg?.protocol ?? "rest"}`)} · ${readOnly ? t("modeRead") : canWrite ? t("modeWrite") : t("modeNoWriteUser")}`}</p>
          {msg && (
            <p role="status" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-100">
              {msg}
            </p>
          )}
          {live && (
            <>
              <section aria-labelledby="lv-res" className="grid gap-2 rounded-2xl border border-white/10 p-4">
                <h2 id="lv-res" className="text-lg font-light text-foreground">
                  {t("resource")}
                </h2>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    [t("board"), `${live.resource.board} · ${live.resource.version}`],
                    [t("uptime"), live.resource.uptime],
                    [t("cpu"), `${live.resource.cpu} %`],
                    [t("memory"), `${mb(live.resource.memUsed)} / ${mb(live.resource.memTotal)}`],
                  ].map(([k, v]) => (
                    <div key={k} className="grid gap-0.5">
                      <dt className="text-xs text-zinc-400">{k}</dt>
                      <dd className="font-mono text-zinc-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section aria-labelledby="lv-if" className="grid gap-2">
                <h2 id="lv-if" className="text-xl font-light text-foreground">
                  {t("interfaces")}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-left text-sm text-zinc-200">
                    <thead>
                      <tr className="text-xs text-zinc-400">
                        <th className="py-2 pr-3 font-normal">{t("ifName")}</th>
                        <th className="py-2 pr-3 font-normal">{t("ifType")}</th>
                        <th className="py-2 pr-3 font-normal">{t("ifState")}</th>
                        <th className="py-2 pr-3 text-right font-normal">{t("ifRx")}</th>
                        <th className="py-2 text-right font-normal">{t("ifTx")}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {live.interfaces.map((i) => (
                        <tr key={i.name} className="border-t border-white/5">
                          <td className="py-1.5 pr-3">{i.name}</td>
                          <td className="py-1.5 pr-3 text-zinc-400">{i.type}</td>
                          <td className={`py-1.5 pr-3 ${i.disabled ? "text-zinc-500" : i.running ? "text-emerald-300" : "text-red-300"}`}>{i.disabled ? t("disabled") : i.running ? t("running") : t("down")}</td>
                          <td className="py-1.5 pr-3 text-right">{i.running ? bps(i.rx) : "—"}</td>
                          <td className="py-1.5 text-right">{i.running ? bps(i.tx) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section aria-labelledby="lv-ss" className="grid gap-2">
                <h2 id="lv-ss" className="text-xl font-light text-foreground">
                  {t("sessions", { n: live.sessions.length })}
                </h2>
                <div className="max-w-sm">
                  <TextField label={t("filter")} value={q} onChange={setQ} />
                </div>
                <ul className="grid max-h-80 gap-1 overflow-y-auto font-mono text-xs text-zinc-200">
                  {sessions.slice(0, 300).map((s) => (
                    <li key={s.name}>
                      <button type="button" onClick={() => void lookup(s.name)} className="text-left underline decoration-white/20 underline-offset-4 hover:decoration-white">
                        {`${s.name} · ${s.address} · ${s.uptime}${s.callerId ? ` · ${s.callerId}` : ""}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
          <section aria-labelledby="lv-cl" className="grid gap-3 rounded-2xl border border-white/10 p-4">
            <h2 id="lv-cl" className="text-lg font-light text-foreground">
              {t("client")}
            </h2>
            <PickField label={t("pickClient")} value={user} onChange={(u) => void lookup(u)} options={[{ value: "", label: "—" }, ...users.map((u) => ({ value: u.value, label: u.label }))]} />
            {client && (
              <div className="grid gap-3 text-sm">
                {!client.secret ? (
                  <p className="text-amber-200">{t("noSecret")}</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      [t("profile"), client.secret.profile],
                      [t("state"), client.secret.disabled ? t("disabled") : client.session ? t("online") : t("offline")],
                      [t("address"), client.session?.address ?? "—"],
                      [t("sessionUptime"), client.session?.uptime ?? "—"],
                      [t("rate"), client.rate ? `↓ ${bps(client.rate.tx)} · ↑ ${bps(client.rate.rx)}` : "—"],
                      [t("lastOut"), [client.secret.lastLoggedOut, client.secret.lastDisconnect].filter(Boolean).join(" · ") || "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="grid gap-0.5">
                        <dt className="text-xs text-zinc-400">{k}</dt>
                        <dd className="font-mono text-zinc-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {client.secret && (
                  <div className="grid gap-2">
                    {!canWrite && <p className="text-xs text-zinc-400">{readOnly ? t("actsLocked") : t("modeNoWriteUser")}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={!canWrite || busy} onClick={() => void act("suspend")} className={DANGER}>
                        {t("acts.suspend")}
                      </button>
                      <button type="button" disabled={!canWrite || busy} onClick={() => void act("reconnect", plan)} className={SMALL}>
                        {t("acts.reconnect")}
                      </button>
                      <button type="button" disabled={!canWrite || busy || !client.session} onClick={() => void act("kick")} className={SMALL}>
                        {t("acts.kick")}
                      </button>
                      <button type="button" disabled={!canWrite || busy} onClick={() => void act(client.secret?.disabled ? "enable" : "disable")} className={client.secret.disabled ? SMALL : DANGER}>
                        {client.secret.disabled ? t("acts.enable") : t("acts.disable")}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-48">
                        <TextField label={t("newPlan")} value={plan} onChange={(v) => setPlan(v.trim().slice(0, 64))} />
                      </div>
                      <button type="button" disabled={!canWrite || busy || !plan} onClick={() => void act("plan", plan)} className={SMALL}>
                        {t("acts.plan")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          <section aria-labelledby="lv-bk" className="grid gap-2">
            <h2 id="lv-bk" className="text-xl font-light text-foreground">
              {t("backups")}
            </h2>
            <p className="text-xs text-zinc-400">{t("backupsHint")}</p>
            <button type="button" disabled={busy} onClick={() => void backup()} className={SMALL}>
              {t("backupNow")}
            </button>
            {backups && !backups.length && <p className="text-sm text-zinc-400">{t("noBackups")}</p>}
            <ul className="grid gap-1 text-sm text-zinc-200">
              {(backups ?? []).map((b) => (
                <li key={b.id}>
                  <a href={`/api/interno/routers/rest?respaldo=${b.id}`} className="underline decoration-white/20 underline-offset-4 hover:decoration-white">
                    {`${when(b.at)} · ${Math.max(1, Math.round(b.size / 1024))} KB · ${b.by || "—"}`}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {live && (
            <section aria-labelledby="lv-log" className="grid gap-2">
              <h2 id="lv-log" className="text-xl font-light text-foreground">
                {t("log")}
              </h2>
              <ul className="grid max-h-80 gap-0.5 overflow-y-auto font-mono text-xs text-zinc-300">
                {live.log.map((l, i) => (
                  <li key={i}>{`${l.time} · ${l.topics} · ${l.message}`}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
