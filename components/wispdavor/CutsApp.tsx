"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { SMALL } from "@/components/finance/FinParts"
import { localToday } from "@/lib/clients/from-lead"
import { saveClients } from "@/lib/clients/store"
import { mxn } from "@/lib/materials/catalog"
import { siteLabel } from "@/lib/sites/model"
import { bySite, cutCommands, cutLists, markServices, type CutRow } from "@/lib/wispdavor/cortes"
import { useWispData } from "./useWispData"


/** /interno/software/wispdavor/cortes: who to cut and reconnect, per deployment, with the MikroTik commands. */
export function CutsApp() {
  const t = useTranslations("wispdavor.cortes")
  const d = useWispData()
  const [done, setDone] = useState("")
  // Deployments whose router is on "Automático" (WispDavor → Routers): there the router cuts and reconnects by itself.
  const [autoSites, setAutoSites] = useState<Set<string>>(new Set())
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/interno/routers?basico=1", { cache: "no-store" })
        if (!r.ok) return
        const b = (await r.json()) as { routers: { siteId: string; auto: boolean; pppoe: boolean }[] }
        setAutoSites(new Set(b.routers.filter((x) => x.auto && x.pppoe && x.siteId).map((x) => x.siteId)))
      } catch {
        // Offline: Cortes works the same without this note.
      }
    })()
  }, [])
  if (!d.loaded) return null
  const lists = cutLists(d.clients, d.payments, localToday())
  const siteName = (id: string) => {
    const s = d.sites.find((x) => x.id === id)
    return s ? siteLabel(s) : t("noSite")
  }
  const mark = (rows: CutRow[], status: "suspendido" | "activo", key: string) => {
    saveClients(markServices(d.clients, rows, status))
    setDone(key)
  }
  const group = (rows: CutRow[], action: "suspend" | "restore", title: string) => (
    <section aria-label={title} className="grid gap-4">
      <h2 className="text-xl font-light text-foreground">
        {title} <span className="font-mono text-base text-zinc-400">({rows.length})</span>
      </h2>
      {!rows.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      {[...bySite(rows)].map(([site, rs]) => {
        const cmd = cutCommands(action, rs)
        const key = `${action}-${site}`
        return (
          <div key={key} className="grid gap-3 rounded-xl border border-white/10 p-4">
            <ul className="grid gap-1 text-sm text-zinc-200">
              {rs.map((r) => (
                <li key={r.serviceId}>
                  <a href={`/interno/admin/clientes?c=${r.clientId}`} className="underline decoration-white/20 underline-offset-4 hover:decoration-white">
                    {t("row", { name: r.name, user: r.user })}
                  </a>{" "}
                  <span className="font-mono text-xs text-zinc-400">{[r.owed > 0 ? t("owed", { amount: mxn(r.owed) }) : "", action === "restore" ? t("plan", { plan: r.plan || "—" }) : ""].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
            {autoSites.has(site) && <p className="text-xs text-emerald-300">{t("autoRouter")}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-300">{site ? t("commands", { site: siteName(site) }) : t("commandsNoSite")}</p>
              {cmd.script && <CopyButton text={cmd.script} label={t("copy")} done={t("copied")} />}
            </div>
            {cmd.script && (
              <pre tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre text-zinc-100">
                <code>{cmd.script}</code>
              </pre>
            )}
            {cmd.errors.length > 0 && (
              <ul className="grid gap-1 text-xs text-amber-200">
                {cmd.errors.map((e, i) => (
                  <li key={i}>{t.has(`errors.${e.code}`) ? t(`errors.${e.code}`, { value: e.value ?? "" }) : `${e.code} ${e.value ?? ""}`}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => mark(rs, action === "suspend" ? "suspendido" : "activo", key)} className={SMALL}>
              {action === "suspend" ? t("markCut", { n: rs.length }) : t("markRestore", { n: rs.length })}
            </button>
            {done === key && <p role="status" className="text-xs text-emerald-300">{t("marked")}</p>}
          </div>
        )
      })}
    </section>
  )
  return (
    <div className="mt-6 grid gap-10">
      <div className="grid gap-2 rounded-xl border border-cyan-400/30 p-4 text-sm text-cyan-100">
        <p>{t("lead")}</p>
        <p>
          {t("needs")}{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
          <a href="/interno/equipos-telecom/mikrotik/scripts" className="underline underline-offset-4">
            {t("needsLink")}
          </a>
        </p>
        <p className="text-xs text-cyan-200/80">{t("planHint")}</p>
      </div>
      {group(lists.cut, "suspend", t("cut"))}
      {group(lists.restore, "restore", t("restore"))}
      <Plain title={t("promised")} rows={lists.promised} extra={(r) => t("promise", { date: r.promise })} />
      <Plain title={t("noUser")} rows={lists.noUser} extra={(r) => (r.owed > 0 ? t("owed", { amount: mxn(r.owed) }) : "")} />
    </div>
  )
}

function Plain({ title, rows, extra }: { title: string; rows: CutRow[]; extra: (r: CutRow) => string }) {
  if (!rows.length) return null
  return (
    <section aria-label={title} className="grid gap-2">
      <h2 className="text-base font-medium text-zinc-200">
        {title} <span className="font-mono text-sm text-zinc-400">({rows.length})</span>
      </h2>
      <ul className="grid gap-1 text-sm text-zinc-300">
        {rows.map((r) => (
          <li key={r.serviceId}>
            <a href={`/interno/admin/clientes?c=${r.clientId}`} className="underline decoration-white/20 underline-offset-4 hover:decoration-white">
              {r.name}
            </a>{" "}
            <span className="font-mono text-xs text-zinc-400">{extra(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
