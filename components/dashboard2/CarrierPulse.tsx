"use client"

import { useState } from "react"
import { scaleLinear, scaleTime } from "d3-scale"
import { area, curveMonotoneX, line } from "d3-shape"
import { quantile, type GatewayHour } from "@/lib/interno/tablero2-net"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

export type PulseRow = { key: string; title: string; sub: string; hours: GatewayHour[]; stats: string }
const ROW = 92
/** On a phone the figures go on their own line, under the name. */
const rowOf = (w: number) => (w < 520 ? ROW + 14 : ROW)
const PLOT = 58

/**
 * The carriers' pulse: one monitor per carrier gateway over the last week, like a heart monitor. The bright line is the
 * hour's median latency, the haze above it reaches the hour's 95th percentile (the jitter), red spikes from the floor
 * are pings lost, gaps are hours without a reply; a live dot beats at "now". All rows share one latency scale.
 */
export function CarrierPulse({ rows, from, now, label, tip: tipText, noLatency }: { rows: PulseRow[]; from: number; now: number; label: string; tip: (h: GatewayHour) => { title: string; rows: { label: string; value: string }[] }; noLatency: string }) {
  const [at, setAt] = useState<{ row: number; i: number } | null>(null)
  const top = Math.max(5, quantile(rows.flatMap((r) => r.hours.map((h) => h.p95 ?? h.rtt).filter((v): v is number => v !== null)), 0.98) ?? 5)
  return (
    <Frame height={(w) => rows.length * rowOf(w) + 22} label={label}>
      {(w, tip) => {
        const x = scaleTime()
          .domain([new Date(from), new Date(now)])
          .range([2, w - 10])
        const y = scaleLinear().domain([0, top]).range([PLOT, 4]).clamp(true)
        const days = x.ticks(w < 520 ? 3 : 7)
        const narrow = w < 520
        const RH = rowOf(w)
        return (
          <g>
            <defs>
              <filter id="t2-glow" x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="t2-haze" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.05} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.32} />
              </linearGradient>
              <pattern id="t2-ecg" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M12 0H0V12" fill="none" stroke="rgba(255,255,255,0.035)" />
              </pattern>
            </defs>
            {days.map((d) => (
              <text key={d.getTime()} x={x(d)} y={rows.length * RH + 16} textAnchor="middle" fontSize={10} fill={INK.muted}>
                {d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}
              </text>
            ))}
            {rows.map((r, ri) => {
              const oy = ri * RH + 22 + (narrow ? 14 : 0)
              const pts = r.hours.map((h) => ({ ...h, at: Date.parse(h.t) + 1800000 }))
              const hasRtt = pts.some((p) => p.rtt !== null)
              const mid = line<(typeof pts)[number]>()
                .defined((p) => p.rtt !== null)
                .x((p) => x(new Date(p.at)))
                .y((p) => y(p.rtt as number))
                .curve(curveMonotoneX)
              const haze = area<(typeof pts)[number]>()
                .defined((p) => p.rtt !== null && p.p95 !== null)
                .x((p) => x(new Date(p.at)))
                .y0((p) => y(p.rtt as number))
                .y1((p) => y(p.p95 as number))
                .curve(curveMonotoneX)
              const last = [...pts].reverse().find((p) => p.rtt !== null)
              const bw = Math.max(1.5, (w - 12) / (7 * 24) - 0.5)
              const hover = at && at.row === ri ? pts[at.i] : null
              return (
                <g
                  key={r.key}
                  transform={`translate(0,${oy})`}
                  onPointerMove={(e) => {
                    const box = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
                    if (!box || !pts.length) return
                    const tx = x.invert(e.clientX - box.left).getTime()
                    let i = 0
                    pts.forEach((p, j) => Math.abs(p.at - tx) < Math.abs(pts[i].at - tx) && (i = j))
                    setAt({ row: ri, i })
                    const tt = tipText(pts[i])
                    tip.show(e, <TipBody title={`${r.title} · ${tt.title}`} rows={tt.rows} />)
                  }}
                  onPointerLeave={() => {
                    setAt(null)
                    tip.hide()
                  }}
                >
                  <text x={2} y={narrow ? -22 : -8} fontSize={11} fill={INK.primary}>
                    {r.title} <tspan fill={INK.muted}>· {r.sub}</tspan>
                  </text>
                  <text x={narrow ? 2 : w - 10} y={-8} textAnchor={narrow ? "start" : "end"} fontSize={10.5} fill={INK.secondary} className="font-mono tabular-nums">
                    {r.stats}
                  </text>
                  <rect x={2} y={0} width={w - 12} height={PLOT} rx={6} fill="url(#t2-ecg)" stroke="rgba(255,255,255,0.06)" />
                  {days.map((d) => (
                    <line key={d.getTime()} x1={x(d)} x2={x(d)} y1={0} y2={PLOT} stroke="rgba(255,255,255,0.05)" />
                  ))}
                  {pts.map((p) =>
                    p.loss > 0 ? <rect key={p.t} x={x(new Date(p.at)) - bw / 2} y={PLOT - Math.max(3, p.loss * PLOT)} width={bw} height={Math.max(3, p.loss * PLOT)} fill={STATUS.critical} opacity={p.loss >= 1 ? 0.55 : 0.9} rx={1} /> : null
                  )}
                  {hasRtt ? (
                    <>
                      <path d={haze(pts) ?? ""} fill="url(#t2-haze)" />
                      <path d={mid(pts) ?? ""} fill="none" stroke="#9ec5f4" strokeWidth={1.6} filter="url(#t2-glow)" className="t2-draw" pathLength={1} />
                    </>
                  ) : (
                    <text x={(w - 10) / 2} y={PLOT / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fill={INK.muted}>
                      {noLatency}
                    </text>
                  )}
                  {last && (
                    <g>
                      <circle cx={x(new Date(last.at))} cy={y(last.rtt as number)} r={3.5} fill="#9ec5f4" filter="url(#t2-glow)" />
                      <circle cx={x(new Date(last.at))} cy={y(last.rtt as number)} r={3.5} fill="none" stroke="#9ec5f4" className="t2-ping" />
                    </g>
                  )}
                  {hover && (
                    <g className="pointer-events-none">
                      <line x1={x(new Date(hover.at))} x2={x(new Date(hover.at))} y1={0} y2={PLOT} stroke={INK.primary} strokeOpacity={0.5} />
                      {hover.rtt !== null && <circle cx={x(new Date(hover.at))} cy={y(hover.rtt)} r={3.5} fill={INK.primary} />}
                    </g>
                  )}
                  <rect x={2} y={0} width={w - 12} height={PLOT} fill="transparent" />
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
