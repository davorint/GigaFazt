"use client"

import { useId } from "react"
import { scaleLinear } from "d3-scale"
import { area, curveMonotoneX, line } from "d3-shape"
import { INK } from "@/components/dashboard/theme"
import { Frame } from "./Frame"

/** A KPI's 12-month trend: a soft area, a 2 px line and the latest point (one series: the tile names it). */
export function Spark({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const id = useId().replace(/:/g, "")
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null)
  if (pts.length < 2) return null
  return (
    <Frame height={46} label={label}>
      {(w) => {
        const x = scaleLinear().domain([0, values.length - 1]).range([2, w - 4])
        const lo = Math.min(...pts.map((p) => p[1]))
        const hi = Math.max(...pts.map((p) => p[1]))
        const y = scaleLinear()
          .domain(lo === hi ? [lo - 1, hi + 1] : [lo, hi])
          .range([42, 6])
        const ln = line<readonly [number, number]>()
          .x((p) => x(p[0]))
          .y((p) => y(p[1]))
          .curve(curveMonotoneX)
        const ar = area<readonly [number, number]>()
          .x((p) => x(p[0]))
          .y0(46)
          .y1((p) => y(p[1]))
          .curve(curveMonotoneX)
        const last = pts[pts.length - 1]
        return (
          <g>
            <defs>
              <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={ar(pts) ?? ""} fill={`url(#sp-${id})`} />
            <path d={ln(pts) ?? ""} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" className="t2-draw" pathLength={1} />
            <circle cx={x(last[0])} cy={y(last[1])} r={3.5} fill={color} stroke={INK.surface} strokeWidth={2} />
          </g>
        )
      }}
    </Frame>
  )
}
