"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { agreementStatus, siteCost, siteLabel, type AgreementStatus } from "@/lib/sites/model"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { contractsStore } from "@/lib/contracts/store"

const TONE: Record<AgreementStatus, string> = {
  vencido: "border-red-400/40 text-red-200",
  "por-vencer": "border-amber-300/40 text-amber-100",
  "sin-fecha": "border-white/15 text-zinc-300",
  renovado: "border-emerald-400/30 text-emerald-200",
  vigente: "border-emerald-400/30 text-emerald-200",
}
const ORDER: AgreementStatus[] = ["vencido", "por-vencer", "sin-fecha", "renovado", "vigente"]

/**
 * Acuerdos con edificios (owner, 2026-11-19; a view of Legal → Contratos since 2026-11-21): every building agreement with
 * where it stands, the ones to renew or negotiate first, and whether its signed contract is in the register. The terms
 * are edited on each deployment (Despliegues → Acuerdo con el edificio).
 */
export function AgreementsApp() {
  const t = useTranslations("acuerdos")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const contracts = useSyncExternalStore(contractsStore.subscribe, contractsStore.snapshot, contractsStore.serverSnapshot).list
  if (!sites.loaded) return null
  const signed = (id: string) => contracts.some((c) => c.kind === "edificio" && c.siteId === id && !c.ended && c.files.length > 0)
  const today = localToday()
  const rows = sites.list
    .map((s) => ({ s, a: agreementStatus(s, today) }))
    .sort((x, y) => ORDER.indexOf(x.a.status) - ORDER.indexOf(y.a.status) || (x.a.end || "9").localeCompare(y.a.end || "9"))
  const count = (st: AgreementStatus) => rows.filter((r) => r.a.status === st).length
  const rent = rows.reduce((a, r) => a + siteCost(r.s), 0)
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["vencido", "por-vencer", "sin-fecha"] as const).map((st) => (
          <div key={st} className="grid gap-1 rounded-xl border border-white/10 p-3">
            <span className="font-mono text-[0.7rem] uppercase tracking-wide text-zinc-400">{t(`status.${st}`)}</span>
            <span className={`font-mono text-lg tabular-nums ${count(st) && st !== "sin-fecha" ? (st === "vencido" ? "text-red-300" : "text-amber-200") : "text-foreground"}`}>{count(st)}</span>
          </div>
        ))}
        <div className="grid gap-1 rounded-xl border border-white/10 p-3">
          <span className="font-mono text-[0.7rem] uppercase tracking-wide text-zinc-400">{t("cost")}</span>
          <span className="font-mono text-lg tabular-nums text-foreground">{mxn(rent)}</span>
        </div>
      </div>
      <p className="text-xs text-zinc-400">{t("hint")}</p>
      {!rows.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      <ul className="grid gap-2">
        {rows.map(({ s, a }) => (
          <li key={s.id}>
            <a href={`/interno/admin/despliegues?d=${s.id}#acuerdo`} className="grid gap-1 rounded-xl border border-white/10 p-3 hover:bg-white/[0.03]">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-zinc-100">{siteLabel(s)}</span>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[0.7rem] ${TONE[a.status]}`}>{t(`status.${a.status}`)}</span>
              </span>
              <span className="text-xs text-zinc-400">
                {[
                  a.end ? t("ends", { date: a.end, days: a.daysLeft ?? 0 }) : t("noEnd"),
                  a.status === "por-vencer" || a.status === "vigente" || a.status === "renovado" ? t("noticeFrom", { date: a.noticeFrom }) : "",
                  t(`renewal.${s.renewal || "none"}`),
                  siteCost(s) ? t("monthly", { amount: mxn(siteCost(s)) }) : "",
                  s.rentIncreasePct !== null ? t("increase", { pct: s.rentIncreasePct }) : "",
                  signed(s.id) ? t("signed") : t("unsigned"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
