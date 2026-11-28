"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

const BTN = "inline-flex min-h-9 items-center rounded-full border px-3 text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/**
 * A remove button that asks on the page (owner, 2026-11-28: no browser pop-ups): "Quitar" → the question, with what
 * stays or goes, and Sí / No.
 */
export function ConfirmRemove({ label, question, detail, onRemove }: { label: string; question: string; detail?: string; onRemove: () => void }) {
  const t = useTranslations("despliegues.sheet")
  const [asking, setAsking] = useState(false)
  const back = useRef(false)
  const button = useRef<HTMLButtonElement>(null)
  // After "No", focus returns to the button that asked.
  useEffect(() => {
    if (!asking && back.current) {
      back.current = false
      button.current?.focus()
    }
  }, [asking])
  const cancel = () => {
    back.current = true
    setAsking(false)
  }
  if (!asking)
    return (
      <button ref={button} type="button" onClick={() => setAsking(true)} className={`${BTN} w-fit border-red-400/30 text-red-200 hover:bg-red-400/10`}>
        {label}
      </button>
    )
  return (
    <div role="alertdialog" aria-label={question} className="grid gap-2 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3">
      <p className="text-sm text-zinc-100">{question}</p>
      {detail && <p className="text-xs whitespace-pre-line text-zinc-300">{detail}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setAsking(false)
            onRemove()
          }}
          className={`${BTN} border-red-400/50 bg-red-400/15 text-red-100 hover:bg-red-400/25`}
        >
          {t("yes")}
        </button>
        {/* Focus starts on "No": Enter alone never removes. */}
        <button type="button" autoFocus onClick={cancel} onKeyDown={(e) => e.key === "Escape" && cancel()} className={`${BTN} border-white/15 text-zinc-100 hover:bg-white/5`}>
          {t("no")}
        </button>
      </div>
    </div>
  )
}
