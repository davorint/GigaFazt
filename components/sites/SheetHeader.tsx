"use client"

import { useRef, type MouseEvent } from "react"
import { missingFields, siteLabel, type SheetSection, type Site } from "@/lib/sites/model"
import type { T } from "./sheet-ui"

/**
 * The sheet's sticky top: back to the list, the deployment's name, "faltan N datos" (each tap goes to the next missing
 * field and opens it) and the jump row to each block.
 */
export function SheetHeader({ t, s, sections, onBack }: { t: T; s: Site; sections: SheetSection[]; onBack: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const missing = missingFields(s)
  const next = useRef(0)
  const goNext = () => {
    if (!missing.length) return
    const m = missing[next.current % missing.length]
    next.current++
    const el = document.getElementById(`f-${m.key}`)
    if (!el) return
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
  }
  return (
    <div className="sticky top-14 z-10 -mx-4 grid gap-2 border-y border-white/10 bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <a href="?" onClick={onBack} className="shrink-0 rounded-md px-1.5 py-1 text-sm text-zinc-300 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={t("nav.back")}>
            ←
          </a>
          <p className="truncate text-sm font-medium text-foreground">{siteLabel(s)}</p>
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={!missing.length}
          title={missing.length ? t("sheet.missingHint") : undefined}
          className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${missing.length ? "border-amber-300/40 text-amber-100 hover:bg-amber-300/10" : "border-emerald-300/30 text-emerald-200"}`}
        >
          {t("sheet.missing", { n: missing.length })}
        </button>
      </div>
      <nav aria-label={t("nav.label")} className="min-w-0">
        <ul className="relative flex gap-1 overflow-x-auto">
          {sections.map((k) => (
            <li key={k} className="shrink-0">
              <a href={`#${k}`} className="block rounded-md px-2 py-1 text-xs whitespace-nowrap text-zinc-300 hover:bg-white/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {t(`nav.${k}`)}
                {missing.some((m) => m.section === k) && (
                  <>
                    <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-amber-300 align-middle" />
                    <span className="sr-only"> ({t("sheet.hasMissing")})</span>
                  </>
                )}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
