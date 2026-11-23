"use client"

import { useState } from "react"
import { scaleLinear, scalePoint } from "d3-scale"
import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut } from "d3-shape"
import type { Streams } from "@/lib/interno/tablero2-more"
import { mxn } from "@/lib/materials/catalog"
import { INK } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { k, short } from "./format"

const H = 300

/**
 * The river of income: each plan's monthly recurring revenue as a stream, the streams flowing around a center line
 * (thickness is money; the vertical position means nothing). Hover a month for every plan's amount and the total.
 */
export function Streamgraph({ streams, label, name, color, totalLabel }: { streams: Streams; label: string; name: (key: string) => string; color: (key: string) => string; totalLabel: string }) {
  const [at, setAt] = useState<number | null>(null)
  const months = streams.rows.map((r) => r.month)
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const series = stack<{ month: string; values: Record<string, number> }, string>()
          .keys(streams.keys)
          .value((d, key) => d.values[key] ?? 0)
          .offset(stackOffsetWiggle)
          .order(stackOrderInsideOut)(streams.rows)
        const lo = Math.min(...series.flatMap((s) => s.map((p) => p[0])))
        const hi = Math.max(...series.flatMap((s) => s.map((p) => p[1])))
        const x = scalePoint<string>().domain(months).range([4, w - 4])
        const y = scaleLinear()
          .domain([lo, hi === lo ? lo + 1 : hi])
          .range([H - 30, 14])
        const shape = area<[number, number] & { data: { month: string } }>()
          .x((p) => x(p.data.month) ?? 0)
          .y0((p) => y(p[0]))
          .y1((p) => y(p[1]))
          .curve(curveBasis)
        const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(w / 72))))
        const pick = (px: number) => {
          let best = 0
          months.forEach((m, i) => Math.abs((x(m) ?? 0) - px) < Math.abs((x(months[best]) ?? 0) - px) && (best = i))
          return best
        }
        return (
          <g
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
              if (!r) return
              const i = pick(e.clientX - r.left)
              setAt(i)
              const row = streams.rows[i]
              const total = streams.keys.reduce((a, key) => a + (row.values[key] ?? 0), 0)
              tip.show(e, <TipBody title={short(row.month)} rows={[...[...streams.keys].reverse().map((key) => ({ label: name(key), value: mxn(row.values[key] ?? 0), color: color(key) })), { label: totalLabel, value: mxn(total) }]} />)
            }}
            onPointerLeave={() => {
              setAt(null)
              tip.hide()
            }}
          >
            <defs>
              {streams.keys.map((key, i) => (
                <linearGradient key={key} id={`t2-stream-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={color(key)} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={color(key)} stopOpacity={0.95} />
                </linearGradient>
              ))}
            </defs>
            <rect width={w} height={H} fill="transparent" />
            {months.map((m, i) =>
              i % step && i !== months.length - 1 ? null : (
                <g key={m}>
                  <line x1={x(m)} x2={x(m)} y1={10} y2={H - 26} stroke={INK.grid} strokeDasharray="1 4" />
                  <text x={x(m)} y={H - 8} textAnchor={i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"} fontSize={10} fill={INK.muted}>
                    {short(m)}
                  </text>
                </g>
              )
            )}
            {series.map((s, i) => (
              <path key={s.key} d={shape(s as never) ?? ""} fill={`url(#t2-stream-${streams.keys.indexOf(s.key)})`} stroke={INK.surface} strokeWidth={1.5} className="t2-fade" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
            {series.map((s) => {
              // The name where the stream is thickest, when it has room.
              let best = 0
              s.forEach((p, i) => p[1] - p[0] > s[best][1] - s[best][0] && (best = i))
              const p = s[best]
              const px = Math.min(w - 60, Math.max(60, x(p.data.month) ?? 0))
              if (y(p[0]) - y(p[1]) < 18) return null
              return (
                <text key={s.key} x={px} y={(y(p[0]) + y(p[1])) / 2} dy="0.35em" textAnchor="middle" fontSize={11} fill="#ffffff" stroke="rgba(0,0,0,0.35)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none">
                  {name(s.key)} · {k(p.data.values[s.key] ?? 0)}
                </text>
              )
            })}
            {at !== null && <line x1={x(months[at])} x2={x(months[at])} y1={8} y2={H - 26} stroke={INK.primary} strokeOpacity={0.6} className="pointer-events-none" />}
          </g>
        )
      }}
    </Frame>
  )
}
