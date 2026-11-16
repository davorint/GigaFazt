"use client"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, Copy, Download, Plus, Save, Trash2, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import type { DeploymentStore } from "@/lib/mikrotik/deployment-store"
import { exportFile, parseFile, summarize, type SavedDeployment } from "@/lib/mikrotik/deployments"
import { fmtNum, fmtPct, fmtRate } from "@/lib/mikrotik/format"
import { decodeDeployment, type LabState } from "@/lib/mikrotik/state"

type Actions = {
  open: (id: string) => void
  saveNew: () => void
  create: (name: string) => void
  duplicate: (id: string, name: string) => void
  remove: (id: string) => void
  importItems: (items: SavedDeployment[]) => number
}
type Props = { state: LabState; saved: DeploymentStore; boundId: string | null; actions: Actions }

const DATE = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" })
const MAX_FILE = 1_000_000
const COLS = ["name", "olt", "clients", "ports", "internet", "demand", "oltLoad", "actions"] as const

/** Load as text color: amber from 80 % of capacity, red at or above it (the % is always written too). */
const loadTone = (ratio: number) => (ratio >= 1 ? "text-red-300" : ratio >= 0.8 ? "text-amber-300" : "text-zinc-100")

/** The deployments saved in this browser: open, duplicate, delete, compare, back up. */
export function DeploymentsPanel({ state, saved, boundId, actions }: Props) {
  const t = useTranslations("mikrotik.deployments")
  const tc = useTranslations("mikrotik.capacity")
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  const rows = useMemo(
    () =>
      saved.list.flatMap((d) => {
        const f = decodeDeployment(d.data)
        return f ? [{ d, f, sum: summarize(f) }] : []
      }),
    [saved.list]
  )
  const nameOf = (n: string) => n.trim() || t("unnamed")

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportFile(saved.list)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `despliegues-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    const items = file.size <= MAX_FILE ? parseFile(await file.text()) : null
    setMessage(items === null ? t("importBad") : t("imported", { count: actions.importItems(items) }))
    if (fileInput.current) fileInput.current.value = ""
  }

  return (
    <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm leading-snug text-zinc-200">{boundId ? t("openNow", { name: nameOf(state.deployment) }) : t("unsaved")}</p>
        {!boundId && (
          <Button type="button" onClick={actions.saveNew}>
            <Save aria-hidden />
            {t("save")}
          </Button>
        )}
      </div>

      {saved.loaded && !saved.persisted && (
        <p className="flex gap-2.5 text-sm leading-snug text-zinc-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
          {t("notPersisted")}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                {COLS.map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 font-normal whitespace-nowrap">
                    {t(`cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {rows.map(({ d, f, sum }) => {
                const name = nameOf(f.deployment)
                const open = d.id === boundId
                const load = sum.internetMbps > 0 ? sum.offeredMbps / sum.internetMbps : Number.POSITIVE_INFINITY
                return (
                  <tr key={d.id} className={`border-t border-white/5 align-top ${open ? "bg-white/[0.04]" : ""}`}>
                    <th scope="row" className="px-3 py-2.5 text-left font-sans font-normal">
                      <span className="block text-sm text-foreground">{name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                        <span className="rounded border border-white/15 px-1.5 py-px">{t(`status.${f.status}`)}</span>
                        {sum.problems > 0 && (
                          <span className="flex items-center gap-1 text-amber-300">
                            <AlertTriangle aria-hidden className="size-3.5" />
                            {t("problems", { count: sum.problems })}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">{t("updatedAt", { date: DATE.format(d.updatedAt) })}</span>
                    </th>
                    <td className="px-3 py-2.5 font-sans text-zinc-200">
                      {f.capacity.pon === "none" ? tc("pons.none") : `${tc(`deployment.models.${f.capacity.oltModel}`)} · ${tc(`pons.${f.capacity.pon}`)}`}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-100">{fmtNum(sum.clients, 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-100">
                      {f.capacity.pon === "none" ? "—" : sum.maxPorts ? `${fmtNum(sum.ports, 0)} / ${fmtNum(sum.maxPorts, 0)}` : fmtNum(sum.ports, 0)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block text-zinc-100">{fmtRate(sum.internetMbps)}</span>
                      <span className="block font-sans text-zinc-400">{sum.links !== null ? t("linksCount", { count: sum.links }) : t("oneLink")}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block text-zinc-100">{fmtRate(sum.offeredMbps)}</span>
                      <span className={`block font-sans ${loadTone(load)}`}>
                        {t("ofInternet", { pct: Number.isFinite(load) ? fmtPct(load) : "—" })}
                        {sum.measured && <span className="text-zinc-400"> · {t("measured")}</span>}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${sum.oltLoad === null ? "text-zinc-400" : loadTone(sum.oltLoad)}`}>
                      {sum.oltLoad === null ? "—" : fmtPct(sum.oltLoad)}
                    </td>
                    <td className="px-3 py-2.5 font-sans">
                      {confirming === d.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-zinc-200">{t("confirm", { name })}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              actions.remove(d.id)
                              setConfirming(null)
                              setMessage(t("removed", { name }))
                            }}
                          >
                            {t("confirmYes")}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                            {t("cancel")}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {open ? (
                            <span className="px-2 text-xs text-zinc-300">{t("current")}</span>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => actions.open(d.id)} aria-label={t("openOne", { name })}>
                              {t("open")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => actions.duplicate(d.id, t("copyName", { name }))}
                            aria-label={t("duplicateOne", { name })}
                            title={t("duplicate")}
                          >
                            <Copy aria-hidden />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConfirming(d.id)} aria-label={t("removeOne", { name })} title={t("remove")}>
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        saved.loaded && <p className="text-sm text-zinc-400">{t("empty")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => actions.create(t("newName", { n: rows.length + 1 }))}>
          <Plus aria-hidden />
          {t("new")}
        </Button>
        <Button type="button" variant="outline" onClick={download} disabled={saved.list.length === 0}>
          <Download aria-hidden />
          {t("export")}
        </Button>
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload aria-hidden />
          {t("import")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      <p aria-live="polite" className="text-sm text-zinc-200 empty:hidden">
        {message}
      </p>

      <p className="max-w-3xl text-xs leading-relaxed text-zinc-400">{t("note")}</p>
    </div>
  )
}
