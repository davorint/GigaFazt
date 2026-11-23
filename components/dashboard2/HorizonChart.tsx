"use client"

import { useState } from "react"
import { scaleTime } from "d3-scale"
import { area, curveMonotoneX } from "d3-shape"
import { INK, SEQUENTIAL, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

export type HorizonRow = { key: string; name: string; link: number | null; hours: { t: number; down: number }[]; peak: string }
const ROW = 30
const GAP = 22
/** Five bands of 20 % of the link each; the last (80 % and more) is the "full" status color. */
export const BAND_COLOR = [SEQUENTIAL[1], SEQUENTIAL[2], SEQUENTIAL[3], SEQUENTIAL[4], STATUS.critical] as const

/**
 * The traffic heartbeat: a week of each deployment's traffic, hour by hour, as a horizon chart. Each row is folded
 * into five bands of 20 % of its links' speed layered on top of each other, darker to brighter blue, and red from 80 %
 * up, so a whole week fits in a thin strip and the hours that fill a link burn red. Without a link speed the row is
 * scaled to its own peak (and says so).
 */
export function HorizonChart({ rows, from, now, label, tipFor }: { rows: HorizonRow[]; from: number; now: number; label: string; tipFor: (r: HorizonRow, h: { t: number; down: number }) => { title: string; rows: { label: string; value: string }[] } }) {
  const [at, setAt] = useState<{ row: number; i: number } | null>(null)
  return (
    <Frame height={rows.length * (ROW + GAP) + 18} label={label}>
      {(w, tip) => {
        const x = scaleTime()
          .domain([new Date(from), new Date(now)])
          .range([2, w - 2])
        const ticks = x.ticks(w < 520 ? 4 : 7)
        return (
          <g>
            {ticks.map((d) => (
              <g key={d.getTime()}>
                <line x1={x(d)} x2={x(d)} y1={10} y2={rows.length * (ROW + GAP)} stroke={INK.grid} strokeDasharray="1 3" />
                <text x={x(d)} y={rows.length * (ROW + GAP) + 12} textAnchor="middle" fontSize={10} fill={INK.muted}>
                  {d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}
                </text>
              </g>
            ))}
            {rows.map((r, ri) => {
              const oy = ri * (ROW + GAP) + GAP - 4
              const scale = r.link ?? Math.max(1, ...r.hours.map((h) => h.down))
              const bands = BAND_COLOR.map((color, b) => {
                const shape = area<{ t: number; down: number }>()
                  .x((h) => x(new Date(h.t)))
                  .y0(ROW)
                  .y1((h) => ROW - Math.max(0, Math.min(1, (h.down / scale - b * 0.2) / 0.2)) * ROW)
                  .curve(curveMonotoneX)
                return { color, d: shape(r.hours) ?? "" }
              })
              const hover = at && at.row === ri ? r.hours[at.i] : null
              return (
                <g
                  key={r.key}
                  transform={`translate(0,${oy})`}
                  onPointerMove={(e) => {
                    const box = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
                    if (!box || !r.hours.length) return
                    const tx = x.invert(e.clientX - box.left).getTime()
                    let i = 0
                    r.hours.forEach((h, j) => Math.abs(h.t - tx) < Math.abs(r.hours[i].t - tx) && (i = j))
                    setAt({ row: ri, i })
                    const tt = tipFor(r, r.hours[i])
                    tip.show(e, <TipBody title={tt.title} rows={tt.rows} />)
                  }}
                  onPointerLeave={() => {
                    setAt(null)
                    tip.hide()
                  }}
                >
                  <text x={2} y={-6} fontSize={11} fill={INK.primary}>
                    {r.name}
                  </text>
                  <text x={w - 2} y={-6} textAnchor="end" fontSize={10.5} fill={INK.secondary} className="font-mono tabular-nums">
                    {r.peak}
                  </text>
                  <rect x={2} y={0} width={w - 4} height={ROW} rx={3} fill="rgba(255,255,255,0.03)" />
                  {bands.map((b, bi) => (
                    <path key={bi} d={b.d} fill={b.color} className="t2-fade" style={{ animationDelay: `${ri * 80 + bi * 60}ms` }} />
                  ))}
                  {hover && <line x1={x(new Date(hover.t))} x2={x(new Date(hover.t))} y1={-2} y2={ROW + 2} stroke={INK.primary} strokeWidth={1.25} className="pointer-events-none" />}
                  <rect x={2} y={0} width={w - 4} height={ROW} fill="transparent" />
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
