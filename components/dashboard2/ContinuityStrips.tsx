"use client"

import { scaleLinear } from "d3-scale"
import { runs, type Cell, type Strip } from "@/lib/interno/tablero2-net"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

export const CELL_COLOR: Record<Cell, string> = { 0: "rgba(255,255,255,0.05)", 1: STATUS.good, 2: STATUS.warning, 3: STATUS.critical }
const ROW = 52
const rowOf = (w: number) => (w < 520 ? 66 : ROW)
const BAR = 20

export type StripRow = { key: string; title: string; sub: string; strip: Strip; headline: string; detail: string }

/**
 * Continuity: every router's last 30 days as a barcode, one thin cell per hour: reporting fine, losing pings to a
 * carrier, in an outage, or not reporting. On the right, its availability since it first reported. Outages are drawn
 * at least a few pixels wide so even a short one shows.
 */
export function ContinuityStrips({ rows, label, cellLabel, hourLabel }: { rows: StripRow[]; label: string; cellLabel: (c: Cell) => string; hourLabel: (t: number) => string }) {
  return (
    <Frame height={(w) => rows.length * rowOf(w) + 24} label={label}>
      {(w, tip) => {
        const right = w < 520 ? 0 : 150
        const RH = rowOf(w)
        const plotW = w - right - 4
        const n = rows[0]?.strip.cells.length ?? 720
        const x = scaleLinear().domain([0, n]).range([2, 2 + plotW])
        const from = rows[0]?.strip.from ?? 0
        const weekTicks = Array.from({ length: Math.floor(n / 168) + 1 }, (_, i) => n - i * 168).filter((v) => v >= 0)
        return (
          <g>
            {weekTicks.map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={10} y2={rows.length * RH + 4} stroke={INK.grid} strokeDasharray="1 3" />
                <text x={x(v)} y={rows.length * RH + 18} textAnchor={v === n ? "end" : "middle"} fontSize={10} fill={INK.muted}>
                  {new Date(from + v * 3600000).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                </text>
              </g>
            ))}
            {rows.map((r, ri) => {
              const oy = ri * RH + 16
              const parts = runs(r.strip.cells)
              return (
                <g
                  key={r.key}
                  transform={`translate(0,${oy})`}
                  onPointerMove={(e) => {
                    const box = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
                    if (!box) return
                    const i = Math.max(0, Math.min(n - 1, Math.floor(x.invert(e.clientX - box.left))))
                    const c = r.strip.cells[i]
                    tip.show(e, <TipBody title={r.title} rows={[{ label: hourLabel(from + i * 3600000), value: cellLabel(c), color: CELL_COLOR[c] }]} />)
                  }}
                  onPointerLeave={tip.hide}
                >
                  <text x={2} y={0} fontSize={11} fill={INK.primary}>
                    {r.title} <tspan fill={INK.muted}>· {r.sub}</tspan>
                  </text>
                  {right === 0 && (
                    <text x={w - 2} y={BAR + 22} textAnchor="end" fontSize={11} fill={INK.primary} className="font-mono tabular-nums">
                      {r.headline}
                    </text>
                  )}
                  <rect x={2} y={8} width={plotW} height={BAR} rx={4} fill="rgba(255,255,255,0.03)" />
                  {parts.map((p) => {
                    const x0 = x(p.from)
                    const wd = Math.max(p.cell === 3 ? 4 : 0.6, x(p.to) - x0)
                    return <rect key={p.from} x={p.cell === 3 ? x0 - Math.max(0, (wd - (x(p.to) - x0)) / 2) : x0} y={8} width={wd} height={BAR} fill={CELL_COLOR[p.cell]} opacity={p.cell === 1 ? 0.7 : 1} rx={p.cell === 3 ? 1.5 : 0} className="t2-fade" />
                  })}
                  {right > 0 && (
                    <g>
                      <text x={w - 2} y={18} textAnchor="end" fontSize={17} fontWeight={300} fill={INK.primary} className="tabular-nums">
                        {r.headline}
                      </text>
                      <text x={w - 2} y={33} textAnchor="end" fontSize={10} fill={INK.muted}>
                        {r.detail}
                      </text>
                    </g>
                  )}
                  {right === 0 && (
                    <text x={2} y={BAR + 22} fontSize={10} fill={INK.muted}>
                      {r.detail}
                    </text>
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
