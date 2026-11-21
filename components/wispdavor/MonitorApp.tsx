"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { loss as lossOf, ONT_SLOW_MS } from "@/lib/wispdavor/monitor"
import type { MonitorView } from "@/lib/wispdavor/monitor-server"
import { clientLabel } from "@/lib/clients/model"
import { LineChart, SERIES_COLORS } from "./LineChart"
import { useWispData } from "./useWispData"

const pct = (x: number) => `${Math.round(x * 100)} %`
const ms = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
const when = (t: string) => new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const minutes = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000))

/** /interno/software/wispdavor/monitoreo: outages, each router's sessions and carriers over the last day, ONTs to check. */
export function MonitorApp() {
  const t = useTranslations("wispdavor.monitoreo")
  const [data, setData] = useState<MonitorView | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState("")
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/monitoreo", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      setData((await r.json()) as MonitorView)
      setNow(new Date().toISOString())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, then every 2 minutes (the routers' pace)
    void load()
    const id = window.setInterval(() => void load(), 120000)
    return () => window.clearInterval(id)
  }, [load])
  const name = (id: string) => data?.routers.find((r) => r.id === id)?.name ?? id
  // PPPoE user → the client's name (from Clientes on this phone).
  const d = useWispData()
  const who = (user: string) => {
    const c = d.clients.find((x) => x.services.some((s) => s.pppoeUser.trim() === user))
    return c ? clientLabel(c) : "—"
  }
  const open = data?.outages.filter((o) => !o.endedAt) ?? []
  const past = data?.outages.filter((o) => o.endedAt) ?? []
  return (
    <div className="mt-6 grid gap-10">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      <p className="rounded-xl border border-amber-400/30 p-3 text-xs text-amber-100">{t("verify")}</p>
      {error && <p className="text-xs text-amber-200">{t("error")}</p>}
      {!data && !error && <p className="text-sm text-zinc-400">{t("loading")}</p>}
      {data && (
        <>
          <section aria-labelledby="mo-open" className="grid gap-2">
            <h2 id="mo-open" className="text-xl font-light text-foreground">
              {t("openTitle")}
            </h2>
            {!open.length && <p className="text-sm text-emerald-300">{t("noOpen")}</p>}
            <ul className="grid gap-2">
              {open.map((o) => (
                <li key={o.id} className="grid gap-1 rounded-xl border border-red-400/40 p-3 text-sm text-red-100">
                  <span className="font-medium">{`${name(o.routerId)} · ${t(`kinds.${o.kind}`)}`}</span>
                  <span className="text-xs text-red-200/80">{[t("since", { date: when(o.startedAt), min: minutes(o.startedAt, now || o.startedAt) }), o.detail].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </section>
          {!data.routers.length && <p className="text-sm text-zinc-400">{t("noRouters")}</p>}
          {data.routers.map((r) => {
            const pts = data.series[r.id] ?? []
            const times = pts.map((p) => p.t)
            const ips = [...new Set(pts.flatMap((p) => p.gateways.map((g) => g.ip)))].slice(0, SERIES_COLORS.length)
            const last = pts.at(-1)
            return (
              <section key={r.id} aria-label={r.name} className="grid gap-4 rounded-2xl border border-white/10 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-light text-foreground">{r.name}</h2>
                  <span className="font-mono text-xs text-zinc-400">{[t("online", { n: r.online, total: r.users }), r.lastSeenAt ? t("seen", { date: when(r.lastSeenAt) }) : t("never")].join(" · ")}</span>
                </div>
                {!pts.length ? (
                  <p className="text-sm text-zinc-400">{t("noData")}</p>
                ) : (
                  <>
                    <div className="grid gap-1">
                      <h3 className="text-sm text-zinc-200">{t("sessionsChart")}</h3>
                      <LineChart times={times} series={[{ label: t("sessions"), color: SERIES_COLORS[0], values: pts.map((p) => p.online) }]} label={t("sessionsChart")} unit={t("sessionsUnit")} fmt={(n) => n.toFixed(0)} />
                    </div>
                    {ips.length > 0 && (
                      <div className="grid gap-1">
                        {/* Latency only when the router can run flood-ping (device-mode traffic-gen); else the loss. */}
                        {pts.some((p) => p.gateways.some((g) => g.rtt !== null)) ? (
                          <>
                            <h3 className="text-sm text-zinc-200">{t("carriersChart")}</h3>
                            <LineChart
                              times={times}
                              series={ips.map((ip, i) => ({ label: ip, color: SERIES_COLORS[i], values: pts.map((p) => p.gateways.find((g) => g.ip === ip)?.rtt ?? null) }))}
                              label={t("carriersChart")}
                              unit="ms"
                              fmt={ms}
                            />
                          </>
                        ) : (
                          <>
                            <h3 className="text-sm text-zinc-200">{t("lossChart")}</h3>
                            <p className="text-xs text-zinc-400">{t("noLatency")}</p>
                            <LineChart
                              times={times}
                              series={ips.map((ip, i) => ({ label: ip, color: SERIES_COLORS[i], values: pts.map((p) => {
                                const g = p.gateways.find((x) => x.ip === ip)
                                return g ? Math.round(lossOf(g) * 100) : null
                              }) }))}
                              label={t("lossChart")}
                              unit="%"
                              fmt={(n) => n.toFixed(0)}
                            />
                          </>
                        )}
                        <ul className="grid gap-0.5 font-mono text-xs text-zinc-300">
                          {ips.map((ip) => {
                            const g = last?.gateways.find((x) => x.ip === ip)
                            return <li key={ip}>{g ? t("gatewayNow", { ip, rtt: g.rtt === null ? "—" : ms(g.rtt), loss: pct(lossOf(g)) }) : t("gatewayMissing", { ip })}</li>
                          })}
                        </ul>
                      </div>
                    )}
                    <details className="rounded-xl border border-white/10 p-3">
                      <summary className="cursor-pointer text-sm text-zinc-200">{t("table")}</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs text-zinc-300">
                          <thead>
                            <tr className="text-zinc-400">
                              <th className="py-1 pr-3 font-normal">{t("time")}</th>
                              <th className="py-1 pr-3 font-normal">{t("sessions")}</th>
                              {ips.map((ip) => (
                                <th key={ip} className="py-1 pr-3 font-normal">{`${ip} (ms · ${t("lossShort")})`}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pts
                              .slice(-24)
                              .reverse()
                              .map((p) => (
                                <tr key={p.t} className="border-t border-white/5">
                                  <td className="py-1 pr-3">{when(p.t)}</td>
                                  <td className="py-1 pr-3">{p.online ?? "—"}</td>
                                  {ips.map((ip) => {
                                    const g = p.gateways.find((x) => x.ip === ip)
                                    return <td key={ip} className="py-1 pr-3">{g ? `${g.rtt === null ? "—" : ms(g.rtt)} · ${pct(lossOf(g))}` : "—"}</td>
                                  })}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                )}
              </section>
            )
          })}
          <section aria-labelledby="mo-onts" className="grid gap-2">
            <h2 id="mo-onts" className="text-xl font-light text-foreground">
              {t("ontsTitle")}
            </h2>
            <p className="text-xs text-zinc-400">{t("ontsHint", { ms: ONT_SLOW_MS })}</p>
            {!data.onts.length && <p className="text-sm text-zinc-400">{t("ontsNone")}</p>}
            <ul className="grid gap-1 font-mono text-xs text-zinc-200">
              {data.onts.map((o) => (
                <li key={`${o.routerId}-${o.user}`}>{t("ontRow", { name: who(o.user), user: o.user, router: name(o.routerId), rtt: o.rtt === null ? "—" : ms(o.rtt), loss: o.loss === null ? "—" : pct(o.loss), date: when(o.at) })}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="mo-past" className="grid gap-2">
            <h2 id="mo-past" className="text-xl font-light text-foreground">
              {t("pastTitle")}
            </h2>
            {!past.length && <p className="text-sm text-zinc-400">{t("pastNone")}</p>}
            <ul className="grid gap-1 text-sm text-zinc-300">
              {past.map((o) => (
                <li key={o.id}>
                  {`${name(o.routerId)} · ${t(`kinds.${o.kind}`)} · ${when(o.startedAt)} · ${t("lasted", { min: minutes(o.startedAt, o.endedAt) })}`}
                  {o.detail ? <span className="font-mono text-xs text-zinc-400">{` · ${o.detail}`}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
