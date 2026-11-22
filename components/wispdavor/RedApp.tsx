"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { localToday } from "@/lib/clients/from-lead"
import { byPort, issuesOf, ontsOf, summary, ONTS_PER_PORT, type Issue, type Ont } from "@/lib/wispdavor/red"
import { useWispData } from "./useWispData"

const LIGHT_TONE = { bien: "text-emerald-300", justo: "text-amber-200", baja: "text-red-300", satura: "text-red-300" } as const
const fmt = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 2 })

/**
 * /interno/software/wispdavor/red (phase 8): every ONT by OLT port, what needs attention, and the free ONT IDs. Built on
 * Clientes' data (no OLT connection); readings come from `display ont optical-info` pasted in Clientes.
 */
export function RedApp() {
  const t = useTranslations("wispdavor.red")
  const d = useWispData()
  const [site, setSite] = useState("")
  const today = localToday()
  const onts = useMemo(() => (d.loaded ? ontsOf(d.clients).filter((o) => !site || o.siteId === site) : []), [d.loaded, d.clients, site])
  const ports = useMemo(() => byPort(onts), [onts])
  const issues = useMemo(() => issuesOf(onts, today), [onts, today])
  const sum = summary(onts, issues)
  const siteName = useMemo(() => new Map(d.sites.map((s) => [s.id, s.name])), [d.sites])
  if (!d.loaded) return null
  const who = (o: Ont) => (
    <a href={`/interno/admin/clientes?c=${o.clientId}`} className="text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-white">
      {o.clientName || t("noName")}
    </a>
  )
  const issueLine = (i: Issue) => {
    switch (i.kind) {
      case "dupSn":
        return t("issue.dupSn", { sn: i.sn, n: i.onts.length })
      case "dupId":
        return t("issue.dupId", { port: i.port, id: i.ontId, n: i.onts.length })
      case "missing":
        return t("issue.missing", { fields: i.fields.map((f) => t(`field.${f}`)).join(", ") })
      case "light":
        return t("issue.light", { rx: fmt(i.ont.rx!), status: t(`light.${i.ont.light!}`) })
      case "falling":
        return t("issue.falling", { db: fmt(i.ont.drop!) })
      case "stale":
        return t("issue.stale", { days: i.days })
      case "noReading":
        return t("issue.noReading")
    }
  }
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-zinc-300">{t("lead", { n: ONTS_PER_PORT })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-zinc-400">
          {t("site")}
          <select value={site} onChange={(e) => setSite(e.target.value)} className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100">
            <option value="">{t("allSites")}</option>
            {d.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Link href="/interno/admin/clientes" className="text-sm text-zinc-300 underline underline-offset-4">
          {t("paste")}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ["total", sum.total, "text-zinc-100"],
            ["bien", sum.light.bien, LIGHT_TONE.bien],
            ["justo", sum.light.justo, LIGHT_TONE.justo],
            ["mala", sum.light.baja + sum.light.satura, LIGHT_TONE.baja],
            ["sin", sum.light.none, "text-zinc-300"],
          ] as const
        ).map(([k, n, tone]) => (
          <div key={k} className="rounded-xl border border-white/10 p-3">
            <dt className="text-xs text-zinc-400">{t(`sum.${k}`)}</dt>
            <dd className={`font-mono text-2xl ${tone}`}>{n}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="wd-red-issues" className="grid gap-2">
        <h2 id="wd-red-issues" className="text-lg font-light text-foreground">
          {t("issuesTitle", { n: issues.length })}
        </h2>
        {!issues.length && <p className="text-sm text-emerald-300">{onts.length ? t("noIssues") : t("none")}</p>}
        <ul className="grid gap-2">
          {issues.map((i, k) => (
            <li key={k} className={`grid gap-1 rounded-xl border p-3 text-sm ${i.kind === "dupSn" || i.kind === "dupId" || i.kind === "light" ? "border-red-400/40" : "border-white/10"}`}>
              <span className="text-zinc-200">{issueLine(i)}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                {("onts" in i ? i.onts : [i.ont]).map((o) => (
                  <span key={o.serviceId}>
                    {who(o)} · <span className="font-mono">{[o.port && `${o.port}${o.ontId !== null ? ` #${o.ontId}` : ""}`, o.sn].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-red-ports" className="grid gap-3">
        <h2 id="wd-red-ports" className="text-lg font-light text-foreground">
          {t("portsTitle")}
        </h2>
        {!ports.length && <p className="text-sm text-zinc-400">{t("noPorts")}</p>}
        {ports.map((p) => (
          <details key={p.port} className="rounded-xl border border-white/10 p-3">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm text-zinc-100">{t("port", { port: p.port })}</span>
              <span className="font-mono text-xs text-zinc-400">{t("portLine", { used: p.used, free: p.free, next: p.nextFree ?? "—" })}</span>
            </summary>
            <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={t("port", { port: p.port })}>
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-zinc-400">
                    <th scope="col" className="py-2 pr-3 font-normal">{t("col.id")}</th>
                    <th scope="col" className="py-2 pr-3 font-normal">{t("col.client")}</th>
                    <th scope="col" className="py-2 pr-3 font-normal">{t("col.ont")}</th>
                    <th scope="col" className="py-2 pr-3 font-normal">{t("col.rx")}</th>
                    <th scope="col" className="py-2 font-normal">{t("col.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.onts.map((o) => (
                    <tr key={o.serviceId} className="border-b border-white/5 align-top">
                      <td className="py-2 pr-3 font-mono text-zinc-200">{o.ontId ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {who(o)}
                        {o.siteId && !site && <span className="block text-xs text-zinc-400">{siteName.get(o.siteId) ?? ""}</span>}
                        {o.status !== "activo" && <span className="block text-xs text-amber-200">{t(`status.${o.status}`)}</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-zinc-300">
                        {o.model || "—"}
                        <span className="block">{o.sn || "—"}</span>
                      </td>
                      <td className={`py-2 pr-3 font-mono ${o.light ? LIGHT_TONE[o.light] : "text-zinc-400"}`}>
                        {o.rx === null ? "—" : `${fmt(o.rx)} dBm`}
                        {o.light && <span className="block text-xs">{t(`light.${o.light}`)}</span>}
                        {o.drop !== null && o.drop >= 1 && <span className="block text-xs text-amber-200">{t("drop", { db: fmt(o.drop) })}</span>}
                      </td>
                      <td className="py-2 font-mono text-xs text-zinc-400">{o.rxDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>
    </div>
  )
}
