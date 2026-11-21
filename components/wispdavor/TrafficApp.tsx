"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import { clientLabel } from "@/lib/clients/model"
import { TrafficChart, type TrafficPoint } from "./TrafficChart"
import { useWispData } from "./useWispData"

const RANGES = ["1", "7", "30", "90"] as const
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 2)} GB`

/** /interno/software/wispdavor/trafico: one client's download and upload over time, and who downloaded most. */
export function TrafficApp() {
  const t = useTranslations("wispdavor.trafico")
  const d = useWispData()
  const [user, setUser] = useState("")
  const [days, setDays] = useState<(typeof RANGES)[number]>("7")
  const [points, setPoints] = useState<TrafficPoint[] | null>(null)
  const [top, setTop] = useState<{ user: string; down: string; up: string }[] | null>(null)
  const [error, setError] = useState(false)
  const users = useMemo(
    () =>
      d.clients
        .flatMap((c) => c.services.filter((s) => s.type === "internet" && s.pppoeUser.trim()).map((s) => ({ user: s.pppoeUser.trim(), label: `${clientLabel(c)} · ${s.pppoeUser.trim()}` })))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [d.clients]
  )
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/interno/trafico?top=1&days=7", { cache: "no-store" })
        if (r.ok) setTop(((await r.json()) as { top: typeof top }).top)
      } catch {
        setError(true)
      }
    })()
  }, [])
  useEffect(() => {
    if (!user) return
    let gone = false
    void (async () => {
      try {
        const r = await fetch(`/api/interno/trafico?user=${encodeURIComponent(user)}&days=${days}`, { cache: "no-store" })
        if (!r.ok) throw new Error(String(r.status))
        const b = (await r.json()) as { points: { t: string; down: string; up: string }[] }
        if (!gone) setPoints(b.points.map((p) => ({ t: p.t, down: Number(p.down), up: Number(p.up) })))
      } catch {
        if (!gone) setError(true)
      }
    })()
    return () => {
      gone = true
    }
  }, [user, days])
  if (!d.loaded) return null
  const seconds = Number(days) <= 7 ? 300 : 3600
  const shown = user ? points : null
  const total = (shown ?? []).reduce((a, p) => ({ down: a.down + p.down, up: a.up + p.up }), { down: 0, up: 0 })
  const perDay = Object.entries(
    (shown ?? []).reduce<Record<string, { down: number; up: number }>>((acc, p) => {
      const k = new Date(p.t).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
      acc[k] = { down: (acc[k]?.down ?? 0) + p.down, up: (acc[k]?.up ?? 0) + p.up }
      return acc
    }, {})
  )
  const nameOf = (u: string) => users.find((x) => x.user === u)?.label ?? u
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {error && <p className="text-xs text-amber-200">{t("error")}</p>}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <PickField
          label={t("client")}
          value={user}
          onChange={(u) => {
            // Another client: the last one's chart doesn't stay on screen while this one loads.
            setPoints(null)
            setUser(u)
          }}
          options={[{ value: "", label: t("pick") }, ...users.map((u) => ({ value: u.user, label: u.label }))]} />
        <PickField
          label={t("range")}
          value={days}
          onChange={(x) => {
            setPoints(null)
            setDays(x)
          }}
          options={RANGES.map((r) => ({ value: r, label: t(`ranges.${r}`) }))} />
      </div>
      {user && shown && !shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      {user && shown && shown.length > 0 && (
        <section className="grid gap-3">
          <TrafficChart points={shown} seconds={seconds} label={t("chart", { user: nameOf(user) })} downLabel={t("down")} upLabel={t("up")} unit={t("unit")} />
          <p className="text-sm text-zinc-200">{t("total", { down: gb(total.down), up: gb(total.up) })}</p>
          <details className="rounded-xl border border-white/10 p-3">
            <summary className="cursor-pointer text-sm text-zinc-200">{t("table")}</summary>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-1 font-normal">{t("day")}</th>
                  <th className="py-1 text-right font-normal">{t("down")}</th>
                  <th className="py-1 text-right font-normal">{t("up")}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-zinc-200">
                {perDay.map(([day, v]) => (
                  <tr key={day} className="border-t border-white/5">
                    <td className="py-1">{day}</td>
                    <td className="py-1 text-right">{gb(v.down)}</td>
                    <td className="py-1 text-right">{gb(v.up)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
      <section aria-labelledby="wd-top" className="grid gap-2">
        <h2 id="wd-top" className="text-xl font-light text-foreground">
          {t("top")}
        </h2>
        {top && !top.length && <p className="text-sm text-zinc-400">{t("topEmpty")}</p>}
        <ol className="grid gap-1 text-sm">
          {top?.map((x) => (
            <li key={x.user} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1">
              <button
                type="button"
                onClick={() => {
                  setPoints(null)
                  setUser(x.user)
                }} className="text-left text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-white">
                {nameOf(x.user)}
              </button>
              <span className="font-mono text-xs text-zinc-400">
                {t("down")} {gb(Number(x.down))} · {t("up")} {gb(Number(x.up))}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
