"use client"

import { INK, SERIES, STATUS } from "@/components/dashboard/theme"

export type CapRow = { name: string; use: number; busy: number | null; speed: number | null }

/**
 * Busy-hour use of each deployment's links as a track: the fill is the use, the tick the point where it's full for us
 * (`full`). At or over it the fill turns critical and says so in words. HTML (no SVG), so it reflows on any width.
 */
export function CapacityBars({ rows, full, fullLabel, detail }: { rows: CapRow[]; full: number; fullLabel: string; detail: (r: CapRow) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.use), full) * 1.08
  return (
    <ul className="grid gap-3.5">
      {rows.map((r, i) => {
        const hot = r.use >= full
        return (
          <li key={r.name} className="grid gap-1.5">
            <p className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-zinc-200">{r.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-zinc-100">
                {Math.round(r.use * 100)} %{hot && <span className="ml-2 font-sans text-red-300">{fullLabel}</span>}
              </span>
            </p>
            <div className="relative h-2.5 rounded-full bg-white/[0.06]">
              <div className="t2-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.use / max) * 100}%`, background: hot ? STATUS.critical : `linear-gradient(90deg, ${SERIES[0]}55, ${SERIES[0]})`, animationDelay: `${i * 60}ms` }} />
              <div aria-hidden className="absolute -inset-y-1 w-px" style={{ left: `${(full / max) * 100}%`, background: INK.secondary }} />
            </div>
            <p className="text-[0.7rem] text-zinc-400">{detail(r)}</p>
          </li>
        )
      })}
    </ul>
  )
}
