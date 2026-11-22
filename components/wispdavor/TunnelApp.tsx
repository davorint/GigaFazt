"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { TextField } from "@/components/mikrotik/TextField"
import { SMALL } from "@/components/finance/FinParts"
import { readState } from "@/lib/sync/state"
import { BASE_PORT, MAX_PEERS, forwardPorts, peerIp, validHost, validKey, type Peer, type TunnelSettings } from "@/lib/wispdavor/tunnel"

type Row = Peer & { inTunnel: boolean; usingTunnel: boolean }
type Data = { settings: TunnelSettings; peers: Row[]; vps: string; canChange: boolean }
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const PRE = "max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs whitespace-pre text-zinc-100"

/**
 * /interno/software/wispdavor/tunel (phase 11): the server (VPS) every MikroTik dials over WireGuard, so Router en vivo
 * reaches routers without a public IP. Steps: the server's address → its setup script → each router's script → paste
 * the router's key back → re-run the server script → "Usar el túnel".
 */
export function TunnelApp() {
  const t = useTranslations("wispdavor.tunel")
  const [d, setD] = useState<Data | null>(null)
  const [host, setHost] = useState("")
  const [pub, setPub] = useState("")
  const [msg, setMsg] = useState("")
  const [scripts, setScripts] = useState<Record<string, string>>({})
  const [keys, setKeys] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/tunel", { cache: "no-store" })
      const b = (await r.json()) as Data & { error?: string }
      if (!r.ok) return setMsg(t("offline"))
      setD(b)
      setHost(b.settings.host)
      setPub(b.settings.publicKey)
    } catch {
      setMsg(t("offline"))
    }
  }, [t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the tunnel once when the page opens
    void load()
  }, [load])
  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setMsg("")
    try {
      const r = await fetch("/api/interno/tunel", { method: "POST", headers: headers(), body: JSON.stringify(body) })
      const b = (await r.json()) as Record<string, unknown>
      if (!r.ok) {
        setMsg(t.has(`errors.${String(b.error)}`) ? t(`errors.${String(b.error)}`) : t("offline"))
        return null
      }
      return b
    } catch {
      setMsg(t("offline"))
      return null
    }
  }
  if (!d) return msg ? <p className="mt-6 text-sm text-amber-200">{msg}</p> : <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>
  const can = d.canChange
  const hostOk = !host || validHost(host.trim().toLowerCase())
  const pubOk = !pub || validKey(pub)
  const ready = !!d.settings.host && !!d.settings.publicKey
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      <p className="rounded-xl border border-amber-300/40 p-3 text-xs text-amber-100">{t("verify")}</p>
      {!can && <p className="text-xs text-zinc-400">{t("adminOnly")}</p>}
      {msg && (
        <p role="status" className="text-sm text-amber-200">
          {msg}
        </p>
      )}

      <section aria-labelledby="tn-1" className="grid gap-3 rounded-2xl border border-white/10 p-4">
        <h2 id="tn-1" className="text-lg font-light text-foreground">
          {t("step1")}
        </h2>
        <p className="text-xs text-zinc-400">{t("step1Hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("host")} value={host} onChange={setHost} hint={hostOk ? t("hostHint") : t("errors.host")} />
          <TextField label={t("publicKey")} value={pub} onChange={setPub} hint={pubOk ? t("publicKeyHint") : t("errors.bad-key")} />
        </div>
        <button
          type="button"
          disabled={!can || !hostOk || !pubOk}
          onClick={() => void post({ action: "settings", settings: { host: host.trim().toLowerCase(), publicKey: pub.trim(), port: d.settings.port } }).then((b) => b && load())}
          className={`${SMALL} disabled:opacity-50`}
        >
          {t("save")}
        </button>
      </section>

      <section aria-labelledby="tn-2" className="grid gap-3 rounded-2xl border border-white/10 p-4">
        <h2 id="tn-2" className="text-lg font-light text-foreground">
          {t("step2")}
        </h2>
        <p className="text-xs text-zinc-400">{t("step2Hint", { udp: d.settings.port, from: BASE_PORT, to: BASE_PORT + 2 * MAX_PEERS + 1 })}</p>
        <pre tabIndex={0} aria-label={t("step2")} className={PRE}>
          {d.vps}
        </pre>
        <CopyButton text={d.vps} label={t("copy")} done={t("copied")} />
      </section>

      <section aria-labelledby="tn-3" className="grid gap-3">
        <h2 id="tn-3" className="text-lg font-light text-foreground">
          {t("step3")}
        </h2>
        <p className="text-xs text-zinc-400">{t("step3Hint")}</p>
        {!ready && <p className="text-xs text-amber-200">{t("needServer")}</p>}
        {!d.peers.length && <p className="text-sm text-zinc-400">{t("noRouters")}</p>}
        <ul className="grid gap-3">
          {d.peers.map((p) => {
            const f = forwardPorts(p.n)
            return (
              <li key={p.routerId} className="grid gap-2 rounded-2xl border border-white/10 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base text-zinc-100">{p.name}</span>
                  <span className={`text-xs ${p.usingTunnel ? "text-emerald-300" : p.inTunnel ? "text-zinc-300" : "text-zinc-400"}`}>
                    {p.usingTunnel ? t("state.using") : p.inTunnel ? (p.publicKey ? t("state.keyed") : t("state.added")) : t("state.out")}
                  </span>
                </div>
                {p.inTunnel && <p className="font-mono text-xs text-zinc-400">{t("addr", { ip: peerIp(p.n), rest: f.rest, api: f.api, rp: p.restPort, ap: p.apiPort })}</p>}
                <div className="flex flex-wrap gap-2">
                  {!p.inTunnel ? (
                    <button type="button" disabled={!can} onClick={() => void post({ action: "add", id: p.routerId }).then((b) => b && (setScripts((s) => ({ ...s, [p.routerId]: String(b.script) })), load()))} className={`${SMALL} disabled:opacity-50`}>
                      {t("add")}
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={!can} onClick={() => void post({ action: "add", id: p.routerId }).then((b) => b && setScripts((s) => ({ ...s, [p.routerId]: String(b.script) })))} className={`${SMALL} disabled:opacity-50`}>
                        {t("showScript")}
                      </button>
                      <button
                        type="button"
                        disabled={!can || !p.publicKey || !ready}
                        onClick={() => void post({ action: "use", id: p.routerId, on: !p.usingTunnel }).then((b) => b && load())}
                        className={`${SMALL} disabled:opacity-50`}
                      >
                        {p.usingTunnel ? t("stopUsing") : t("use")}
                      </button>
                      <button
                        type="button"
                        disabled={!can}
                        onClick={() => window.confirm(t("removeConfirm", { name: p.name })) && void post({ action: "remove", id: p.routerId }).then((b) => b && load())}
                        className={`${SMALL} disabled:opacity-50`}
                      >
                        {t("remove")}
                      </button>
                    </>
                  )}
                </div>
                {scripts[p.routerId] && (
                  <div className="grid gap-2">
                    <pre tabIndex={0} aria-label={t("routerScript", { name: p.name })} className={PRE}>
                      {scripts[p.routerId]}
                    </pre>
                    <CopyButton text={scripts[p.routerId]} label={t("copy")} done={t("copied")} />
                  </div>
                )}
                {p.inTunnel && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <TextField
                      label={t("routerKey")}
                      value={keys[p.routerId] ?? p.publicKey}
                      onChange={(v) => setKeys((k) => ({ ...k, [p.routerId]: v }))}
                      hint={keys[p.routerId] && !validKey(keys[p.routerId]) ? t("errors.bad-key") : t("routerKeyHint")}
                    />
                    <button
                      type="button"
                      disabled={!can || !validKey(keys[p.routerId] ?? "") || keys[p.routerId] === p.publicKey}
                      onClick={() => void post({ action: "key", id: p.routerId, key: keys[p.routerId] }).then((b) => b && (setMsg(t("keySaved")), load()))}
                      className={`${SMALL} disabled:opacity-50`}
                    >
                      {t("saveKey")}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
