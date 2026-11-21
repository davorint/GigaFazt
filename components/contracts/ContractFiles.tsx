"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { MAX_BYTES, sizeLabel } from "@/lib/contracts/files"
import { MAX_FILES, decodeFiles, type Contract, type ContractFile } from "@/lib/contracts/model"
import { contractsStore } from "@/lib/contracts/store"
import { readState } from "@/lib/sync/state"
import { DANGER, SMALL } from "@/components/finance/FinParts"

/** Longest side of a photo after shrinking it (enough to read a signed page). */
const MAX_SIDE = 2400

/**
 * A photo too large to send is redrawn smaller as JPEG on the phone (owner, 2026-11-21: phones' photos of signed pages
 * are often over the host's 4.5 MB limit). PDFs and photos already under the limit go as they are.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_BYTES) return file
  try {
    const img = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size <= MAX_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
    }
  } catch {
    // The browser can't read this photo: send it as it is, the server says if it's too big.
  }
  return file
}

/** The contract as it is now in this browser (the upload can finish after other edits). */
const current = (id: string) => contractsStore.list().find((x) => x.id === id)

function addFile(id: string, f: ContractFile) {
  const c = current(id)
  if (c) contractsStore.save({ ...c, files: [...c.files, f], updatedAt: new Date().toISOString() })
}

/** A contract's signed copies: open, download, upload more, take out. Uploading and opening need signal. */
export function ContractFiles({ c }: { c: Contract }) {
  const t = useTranslations("contratos.files")
  const id = useId()
  const [busy, setBusy] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const max = sizeLabel(MAX_BYTES)

  const upload = async (list: File[]) => {
    if (!list.length) return
    const errs: string[] = []
    for (const raw of list) {
      if ((current(c.id)?.files.length ?? 0) >= MAX_FILES) {
        errs.push(t("errors.full", { n: MAX_FILES }))
        break
      }
      setBusy(raw.name)
      const file = await shrink(raw)
      if (file.size > MAX_BYTES) {
        errs.push(t("errors.too-big", { name: raw.name, max }))
        continue
      }
      const form = new FormData()
      form.set("contrato", c.id)
      form.set("archivo", file, file.name)
      try {
        const res = await fetch("/api/interno/archivos", { method: "POST", body: form, headers: { "x-interno-nombre": encodeURIComponent(readState().name) } })
        const body = (await res.json().catch(() => ({}))) as { file?: unknown; error?: string }
        const [f] = decodeFiles([body.file])
        if (res.ok && f) addFile(c.id, f)
        else {
          const code = body.error === "too-big" || body.error === "bad-type" || body.error === "empty" || body.error === "signin" || body.error === "no-database" ? body.error : "server"
          errs.push(t(`errors.${code}`, { name: raw.name, max }))
          if (code === "signin" || code === "no-database") break
        }
      } catch {
        errs.push(t("errors.offline", { name: raw.name }))
      }
    }
    setBusy("")
    setErrors(errs)
  }

  const remove = async (f: ContractFile) => {
    if (!window.confirm(t("confirmRemove", { name: f.name }))) return
    try {
      const res = await fetch(`/api/interno/archivos/${f.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(String(res.status))
      const now = current(c.id)
      if (now) contractsStore.save({ ...now, files: now.files.filter((x) => x.id !== f.id), updatedAt: new Date().toISOString() })
      setErrors([])
    } catch {
      setErrors([t("errors.remove")])
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-2 rounded-xl border border-white/10 p-3">
      <h3 id={`${id}-h`} className="text-sm font-medium text-foreground">
        {t("title")}
      </h3>
      <p className="text-xs text-zinc-400">{t("hint", { max })}</p>
      {!c.files.length && <p className="text-sm text-amber-200">{t("none")}</p>}
      <ul className="grid gap-2">
        {c.files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm text-zinc-100">{f.name}</span>
              <span className="font-mono text-xs text-zinc-400">{t("meta", { size: sizeLabel(f.size), date: f.at.slice(0, 10), by: f.by || "none" })}</span>
            </span>
            <span className="flex flex-wrap gap-2">
              <a href={`/api/interno/archivos/${f.id}`} target="_blank" rel="noopener noreferrer" className={SMALL}>
                {t("open")}
              </a>
              <a href={`/api/interno/archivos/${f.id}?descargar=1`} download={f.name} className={SMALL}>
                {t("download")}
              </a>
              <button type="button" onClick={() => remove(f)} className={DANGER}>
                {t("remove")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <label className={`${SMALL} cursor-pointer has-[:disabled]:opacity-50`}>
        {busy ? t("uploading", { name: busy }) : t("add")}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={(e) => {
            // Copied before clearing the box, so the same file can be picked again.
            const files = Array.from(e.target.files ?? [])
            e.target.value = ""
            void upload(files)
          }} className="sr-only" />
      </label>
      {errors.length > 0 && (
        <ul role="alert" className="grid gap-1 text-xs text-red-200">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
