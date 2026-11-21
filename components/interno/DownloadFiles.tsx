"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

type FileRow = { url: string; path: string; size: number; at: string }

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
const mb = (n: number) => `${Math.max(1, Math.round(n / 1048576))} MB`

/**
 * "Descargar archivos" (owner, 2026-11-21): the kept files (contracts' signed copies, field photos and signatures) in one
 * zip, built on the phone: the host can't answer one big zip, so each file comes on its own and fflate packs them
 * (stored, not recompressed: photos and PDFs are compressed already).
 */
export function DownloadFiles() {
  const t = useTranslations("interno.session.files")
  const [state, setState] = useState("")
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setState(t("listing"))
    try {
      const r = await fetch("/api/interno/archivos-lista", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      const { files } = (await r.json()) as { files: FileRow[] }
      if (!files.length) {
        setState(t("none"))
        return
      }
      const total = files.reduce((a, f) => a + f.size, 0)
      if (total > 300 * 1048576 && !window.confirm(t("big", { size: mb(total) }))) {
        setState("")
        return
      }
      const { zipSync } = await import("fflate")
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
      const failed: string[] = []
      for (const [i, f] of files.entries()) {
        setState(t("progress", { i: i + 1, n: files.length }))
        try {
          const res = await fetch(f.url, { cache: "no-store" })
          if (!res.ok) throw new Error(String(res.status))
          entries[f.path] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]
        } catch {
          failed.push(f.path)
        }
      }
      const zip = zipSync(entries)
      const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `archivos-gigafazt-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setState(failed.length ? t("partial", { ok: files.length - failed.length, n: files.length }) : t("done", { n: files.length, size: mb(total) }))
    } catch {
      setState(t("error"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void run()} className={SMALL}>
        {t("button")}
      </button>
      {state && (
        <span role="status" className="text-xs text-zinc-300">
          {state}
        </span>
      )}
    </span>
  )
}
