"use client"

import { useState } from "react"
import { scaleLinear, scalePoint } from "d3-scale"
import { area, curveMonotoneX, line } from "d3-shape"
import { mxn } from "@/lib/materials/catalog"
import { INK, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { k, short } from "./format"

export type RevenuePoint = { month: string; billed: number; collected: number }
export type ForecastPoint = { month: string; low: number; high: number }

const H = 300

/**
 * Billed (line) and collected (area) per month on one money axis, then the next months as a band from "with the usual
 * cancellations" to "nobody leaves" (an estimate, marked). A crosshair snaps to the month under the pointer.
 */
export function RevenueChart({ rows, forecast, label, names, estimate }: { rows: RevenuePoint[]; forecast: ForecastPoint[]; label: string; names: { billed: string; collected: string; low: string; high: string }; estimate: string }) {
  const [at, setAt] = useState<number | null>(null)
  const months = [...rows.map((r) => r.month), ...forecast.map((f) => f.month)]
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const m = { top: 20, right: 8, bottom: 26, left: 8 }
        const x = scalePoint<string>().domain(months).range([m.left + 34, w - m.right - 6])
        const max = Math.max(1, ...rows.flatMap((r) => [r.billed, r.collected]), ...forecast.map((f) => f.high))
        const y = scaleLinear().domain([0, max]).nice().range([H - m.bottom, m.top])
        const X = (mo: string) => x(mo) ?? 0
        const billed = line<RevenuePoint>()
          .x((d) => X(d.month))
          .y((d) => y(d.billed))
          .curve(curveMonotoneX)
        const collected = area<RevenuePoint>()
          .x((d) => X(d.month))
          .y0(y(0))
          .y1((d) => y(d.collected))
          .curve(curveMonotoneX)
        const last = rows[rows.length - 1]
        const band = last ? [{ month: last.month, low: last.billed, high: last.billed }, ...forecast] : forecast
        const fan = area<ForecastPoint>()
          .x((d) => X(d.month))
          .y0((d) => y(d.low))
          .y1((d) => y(d.high))
          .curve(curveMonotoneX)
        const mid = line<ForecastPoint>()
          .x((d) => X(d.month))
          .y((d) => y((d.low + d.high) / 2))
          .curve(curveMonotoneX)
        const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(w / 70))))
        const pick = (px: number) => {
          let best = 0
          months.forEach((mo, i) => Math.abs(X(mo) - px) < Math.abs(X(months[best]) - px) && (best = i))
          return best
        }
        const i = at
        const hist = i !== null && i < rows.length ? rows[i] : null
        const fut = i !== null && i >= rows.length ? forecast[i - rows.length] : null
        return (
          <g
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
              if (!r) return
              const j = pick(e.clientX - r.left)
              setAt(j)
              const h = j < rows.length ? rows[j] : null
              const f = j >= rows.length ? forecast[j - rows.length] : null
              tip.show(
                e,
                h ? (
                  <TipBody title={short(h.month)} rows={[{ label: names.billed, value: mxn(h.billed), color: SERIES[0] }, { label: names.collected, value: mxn(h.collected), color: SERIES[1] }, ...(h.billed ? [{ label: "%", value: `${Math.round((h.collected / h.billed) * 100)} %` }] : [])]} />
                ) : f ? (
                  <TipBody title={`${short(f.month)} · ${estimate}`} rows={[{ label: names.high, value: mxn(f.high), color: SERIES[0] }, { label: names.low, value: mxn(f.low), color: SERIES[0] }]} />
                ) : null
              )
            }}
            onPointerLeave={() => {
              setAt(null)
              tip.hide()
            }}
          >
            <defs>
              <linearGradient id="t2-collected" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES[1]} stopOpacity={0.42} />
                <stop offset="100%" stopColor={SERIES[1]} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="t2-fan" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.4} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.14} />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={w} height={H} fill="transparent" />
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={m.left + 34} x2={w - m.right} y1={y(t)} y2={y(t)} stroke={INK.grid} />
                <text x={m.left + 28} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill={INK.muted}>
                  {k(t)}
                </text>
              </g>
            ))}
            {months.map((mo, j) =>
              j % step && j !== months.length - 1 ? null : (
                <text key={mo} x={X(mo)} y={H - 6} textAnchor="middle" fontSize={10} fill={j >= rows.length ? INK.secondary : INK.muted}>
                  {short(mo)}
                </text>
              )
            )}
            {forecast.length > 0 && last && (
              <g>
                <rect x={X(last.month)} y={m.top - 14} width={w - m.right - X(last.month)} height={H - m.bottom - m.top + 14} fill="rgba(255,255,255,0.025)" />
                <line x1={X(last.month)} x2={X(last.month)} y1={m.top - 14} y2={H - m.bottom} stroke={INK.axis} strokeDasharray="3 3" />
                <text x={X(last.month) + 6} y={m.top - 4} fontSize={9} letterSpacing="0.08em" fill="#fcd34d" className="font-mono">
                  {estimate}
                </text>
                <path d={fan(band) ?? ""} fill="url(#t2-fan)" className="t2-fade" />
                <path d={mid(band) ?? ""} fill="none" stroke={SERIES[0]} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.8} />
              </g>
            )}
            <path d={collected(rows) ?? ""} fill="url(#t2-collected)" className="t2-fade" />
            <path d={line<RevenuePoint>().x((d) => X(d.month)).y((d) => y(d.collected)).curve(curveMonotoneX)(rows) ?? ""} fill="none" stroke={SERIES[1]} strokeWidth={2} className="t2-draw" pathLength={1} />
            <path d={billed(rows) ?? ""} fill="none" stroke={SERIES[0]} strokeWidth={2} className="t2-draw" pathLength={1} />
            {last && (
              <g>
                <circle cx={X(last.month)} cy={y(last.billed)} r={4} fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} />
                <circle cx={X(last.month)} cy={y(last.collected)} r={4} fill={SERIES[1]} stroke={INK.surface} strokeWidth={2} />
              </g>
            )}
            {i !== null && (
              <g className="pointer-events-none">
                <line x1={X(months[i])} x2={X(months[i])} y1={m.top} y2={H - m.bottom} stroke={INK.secondary} strokeOpacity={0.5} />
                {hist && <circle cx={X(hist.month)} cy={y(hist.billed)} r={4.5} fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} />}
                {hist && <circle cx={X(hist.month)} cy={y(hist.collected)} r={4.5} fill={SERIES[1]} stroke={INK.surface} strokeWidth={2} />}
                {fut && <circle cx={X(fut.month)} cy={y(fut.high)} r={4} fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} />}
                {fut && <circle cx={X(fut.month)} cy={y(fut.low)} r={4} fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} />}
              </g>
            )}
          </g>
        )
      }}
    </Frame>
  )
}
