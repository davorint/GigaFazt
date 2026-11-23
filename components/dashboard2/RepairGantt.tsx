"use client"

import { scaleLinear, scaleTime } from "d3-scale"
import { area, curveMonotoneX } from "d3-shape"
import { REPAIR_GROUPS, type RepairBar, type RepairGroup } from "@/lib/interno/tablero2-more"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

export const REPAIR_COLOR: Record<RepairGroup, string> = Object.fromEntries(REPAIR_GROUPS.map((g, i) => [g, SERIES[i]])) as Record<RepairGroup, string>
const BAR = 10
const ROW = 15
const CURVE = 64

/**
 * The repair rhythm: every fault report of the last weeks as a bar from when it was opened to when it was fixed, packed
 * in lanes, colored by kind. Reports still open run to the right edge ("now") and end in a pulsing red point. Under
 * the bars, how many were open at the same time (every 6 hours): the backlog rising and falling.
 */
export function RepairGantt({ bars, lanes, from, now, label, backlogLabel, tipFor }: { bars: RepairBar[]; lanes: number; from: number; now: number; label: string; backlogLabel: (n: number) => string; tipFor: (b: RepairBar) => { title: string; rows: { label: string; value: string }[] } }) {
  const top = lanes * ROW + 10
  const height = top + CURVE + 34
  const samples: { t: number; n: number }[] = []
  for (let t = from; t <= now; t += 6 * 3600000) samples.push({ t, n: bars.filter((b) => b.start <= t && t < b.end).length })
  samples.push({ t: now, n: bars.filter((b) => b.open).length })
  const most = Math.max(1, ...samples.map((s) => s.n))
  return (
    <Frame height={height} label={label}>
      {(w, tip) => {
        const x = scaleTime()
          .domain([new Date(from), new Date(now)])
          .range([4, w - 10])
        const y = scaleLinear()
          .domain([0, most])
          .range([top + CURVE, top + 14])
        const ticks = x.ticks(w < 520 ? 4 : 9)
        const curve = area<{ t: number; n: number }>()
          .x((s) => x(new Date(s.t)))
          .y0(top + CURVE)
          .y1((s) => y(s.n))
          .curve(curveMonotoneX)
        const peak = samples.reduce((a, s) => (s.n > a.n ? s : a), samples[0])
        return (
          <g>
            <defs>
              <linearGradient id="t2-backlog" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={STATUS.critical} stopOpacity={0.55} />
                <stop offset="100%" stopColor={STATUS.critical} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t.getTime()}>
                <line x1={x(t)} x2={x(t)} y1={2} y2={height - 22} stroke={INK.grid} />
                <text x={x(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>
                  {t.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                </text>
              </g>
            ))}
            <line x1={x(new Date(now))} x2={x(new Date(now))} y1={0} y2={height - 22} stroke={STATUS.critical} strokeOpacity={0.6} />
            {bars.map((b, i) => {
              const x0 = x(new Date(Math.max(b.start, from)))
              const x1 = Math.max(x0 + 4, x(new Date(b.end)))
              const yy = 4 + b.lane * ROW
              const t = tipFor(b)
              return (
                <g key={b.id} onPointerMove={(e) => tip.show(e, <TipBody title={t.title} rows={t.rows} />)} onPointerLeave={tip.hide}>
                  <rect x={x0 - 2} y={yy - 2} width={x1 - x0 + 4} height={BAR + 4} fill="transparent" />
                  <rect x={x0} y={yy} width={x1 - x0} height={BAR} rx={BAR / 2} fill={REPAIR_COLOR[b.group]} opacity={b.open ? 1 : 0.82} className="t2-grow" style={{ animationDelay: `${Math.min(900, i * 8)}ms` }} />
                  {b.open && (
                    <>
                      <circle cx={x1} cy={yy + BAR / 2} r={4} fill={STATUS.critical} stroke={INK.surface} strokeWidth={1.5} />
                      <circle cx={x1} cy={yy + BAR / 2} r={4} fill="none" stroke={STATUS.critical} className="t2-ping" />
                    </>
                  )}
                </g>
              )
            })}
            <line x1={4} x2={w - 10} y1={top + CURVE + 0.5} y2={top + CURVE + 0.5} stroke={INK.axis} />
            <path d={curve(samples) ?? ""} fill="url(#t2-backlog)" stroke={STATUS.critical} strokeWidth={1.5} strokeOpacity={0.8} className="t2-fade" />
            <text x={6} y={top + 8} fontSize={10} fill={INK.muted}>
              {backlogLabel(most)}
            </text>
            {peak && peak.n > 0 && <circle cx={x(new Date(peak.t))} cy={y(peak.n)} r={3} fill={STATUS.critical} stroke={INK.surface} strokeWidth={1.5} />}
          </g>
        )
      }}
    </Frame>
  )
}
