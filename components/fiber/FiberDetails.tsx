"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { Plus } from "lucide-react"
import { cn } from "cn"
import { SimTag } from "@/components/hud/SimTag"
import { LazyTelemetryPanel } from "./LazyTelemetryPanel"

/**
 * The Fiber section's technical depth (simulated telemetry + latency physics)
 * behind one quiet disclosure row, so the section reads as one visual and one
 * proof point (owner, 2026-11-08: "hyper expensive" pass E). The panel and its
 * chunk load only once opened. The SIMULACIÓN tag sits on the row itself so
 * the label is visible before the data is (hard rule #2).
 */
export function FiberDetails() {
  const t = useTranslations("fiber.details")
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className="border-y border-white/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-6 py-7 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span>
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-normal tracking-[-0.02em] sm:text-2xl">{t("title")}</span>
            <SimTag />
          </span>
          <span className="mt-1.5 block text-sm text-muted-foreground sm:text-base">{t("desc")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-foreground/75 transition-colors group-hover:text-foreground">
          <span className="max-sm:sr-only">{open ? t("close") : t("open")}</span>
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full border border-white/15 transition-colors group-hover:border-white/30"
          >
            <Plus className={cn("size-4 transition-transform duration-200", open && "rotate-45")} />
          </span>
        </span>
      </button>
      <div id={id} hidden={!open} className="pb-10">
        {open && <LazyTelemetryPanel />}
      </div>
    </div>
  )
}
