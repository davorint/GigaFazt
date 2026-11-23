"use client"

import { scaleLinear } from "d3-scale"
import type { Cohort } from "@/lib/interno/tablero2"
import { INK, SEQUENTIAL } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { pct, short } from "./format"

/** 0 % → near the surface, 100 % → the strongest blue (one hue, light grows with the share kept). */
const color = scaleLinear<string>().domain([0, 0.25, 0.5, 0.75, 1]).range([...SEQUENTIAL]).clamp(true)
export const cohortColor = (v: number) => color(v)

/**
 * Retention by cohort: one row per month clients joined (how many on the left), one column per month after; each cell
 * the share still with service. Reads down a column to compare cohorts at the same age.
 */
export function CohortGrid({ rows, label, ageLabel, sizeLabel, tipTitle, tipKept }: { rows: Cohort[]; label: string; ageLabel: (k: number) => string; sizeLabel: string; tipTitle: (month: string, k: number) => string; tipKept: string }) {
  const shown = rows.filter((r) => r.size)
  const n = rows.length
  const cell = (w: number) => Math.max(5, Math.min(44, (w - 92) / n - 3))
  return (
    <Frame height={(w) => shown.length * (Math.max(12, cell(w) * 0.78) + 3) + 34} label={label}>
      {(w, tip) => {
        const c = cell(w)
        const ch = Math.max(12, c * 0.78)
        const left = 92
        const step = n > 12 ? 3 : n > 6 ? 2 : 1
        return (
          <g>
            <text x={left - 8} y={12} textAnchor="end" fontSize={10} fill={INK.muted}>
              {sizeLabel}
            </text>
            {rows[0]?.cells.map((_, kk) =>
              kk % step ? null : (
                <text key={kk} x={left + kk * (c + 3) + c / 2} y={12} textAnchor="middle" fontSize={10} fill={INK.muted}>
                  {ageLabel(kk)}
                </text>
              )
            )}
            {shown.map((r, i) => {
              const y = 22 + i * (ch + 3)
              return (
                <g key={r.month}>
                  <text x={0} y={y + ch / 2} dy="0.35em" fontSize={11} fill={INK.secondary}>
                    {short(r.month)}
                  </text>
                  <text x={left - 8} y={y + ch / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={INK.primary} className="tabular-nums">
                    {r.size}
                  </text>
                  {r.cells.map((v, kk) =>
                    v === null ? null : (
                      <g key={kk} onPointerMove={(e) => tip.show(e, <TipBody title={tipTitle(r.month, kk)} rows={[{ label: tipKept, value: `${pct(v)} · ${Math.round(v * r.size)}/${r.size}`, color: color(v) }]} />)} onPointerLeave={tip.hide}>
                        <rect x={left + kk * (c + 3)} y={y} width={c} height={ch} rx={4} fill={color(v)} className="t2-fade" style={{ animationDelay: `${(i + kk) * 22}ms` }} />
                        {c >= 30 && (
                          <text x={left + kk * (c + 3) + c / 2} y={y + ch / 2} dy="0.35em" textAnchor="middle" fontSize={10} fill={v >= 0.6 ? "#0e0e10" : INK.primary} className="pointer-events-none tabular-nums">
                            {Math.round(v * 100)}
                          </text>
                        )}
                      </g>
                    )
                  )}
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
