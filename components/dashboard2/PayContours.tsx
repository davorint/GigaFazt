"use client"

import { contourDensity, type ContourMultiPolygon } from "d3-contour"
import { scaleLinear } from "d3-scale"
import { interpolateRgb } from "d3-interpolate"
import type { PayPrint } from "@/lib/interno/tablero2-x"
import { INK, SEQUENTIAL, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const H = 320
const M = { top: 12, right: 10, bottom: 30, left: 34 }

/** GeoJSON-like polygons (already in pixels) to an SVG path, without pulling in d3-geo. */
const pathOf = (c: ContourMultiPolygon) => c.coordinates.map((poly) => poly.map((ring) => `M${ring.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join("L")}Z`).join("")).join("")

/**
 * The payment fingerprint: where payments land by day of the month (across) and by how long the client had been with
 * us (up), as a topographic map — the denser, the brighter. The dashed line is the due day (day 10: from the 11th it's
 * late). A punctual base shows as a bright ridge left of the line; trouble shows as a hill to its right.
 */
export function PayContours({ points, maxTenure, due, label, dueLabel, xLabel, yLabel, cellTip }: { points: PayPrint[]; maxTenure: number; due: number; label: string; dueLabel: string; xLabel: string; yLabel: string; cellTip: (day: number, months: number, n: number) => { title: string; rows: { label: string; value: string }[] } }) {
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const x = scaleLinear().domain([0.5, 31.5]).range([M.left, w - M.right])
        const top = Math.ceil(maxTenure / 3) * 3
        const y = scaleLinear().domain([0, top]).range([H - M.bottom, M.top])
        const contours = contourDensity<PayPrint>()
          .x((p) => x(p.day))
          .y((p) => y(p.tenure))
          .size([w, H])
          .bandwidth(Math.max(10, w / 70))
          .thresholds(14)(points)
        const max = Math.max(...contours.map((c) => c.value), 1e-9)
        const tint = interpolateRgb(SEQUENTIAL[1], SEQUENTIAL[4])
        return (
          <g
            onPointerMove={(e) => {
              const box = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect()
              if (!box) return
              const day = Math.max(1, Math.min(31, Math.round(x.invert(e.clientX - box.left))))
              const months = Math.max(0, Math.round(y.invert(e.clientY - box.top)))
              const n = points.filter((p) => p.day === day && Math.abs(p.tenure - months) < 1.5).length
              const t = cellTip(day, months, n)
              tip.show(e, <TipBody title={t.title} rows={t.rows} />)
            }}
            onPointerLeave={tip.hide}
          >
            <defs>
              <clipPath id="t2-pay-plot">
                <rect x={M.left} y={M.top} width={w - M.left - M.right} height={H - M.top - M.bottom} />
              </clipPath>
            </defs>
            <rect x={M.left} y={M.top} width={w - M.left - M.right} height={H - M.top - M.bottom} fill="rgba(255,255,255,0.02)" />
            <g clipPath="url(#t2-pay-plot)">
              {contours.map((c, i) => (
                <path key={i} d={pathOf(c)} fill={tint(c.value / max)} fillOpacity={0.18 + 0.75 * (c.value / max)} stroke={SEQUENTIAL[4]} strokeOpacity={0.25} strokeWidth={0.75} className="t2-fade" style={{ animationDelay: `${i * 40}ms` }} />
              ))}
              {points.map((p, i) => (
                <circle key={i} cx={x(p.day) + ((i * 37) % 9) - 4} cy={y(p.tenure)} r={1} fill="#ffffff" opacity={0.22} />
              ))}
            </g>
            <line x1={x(due + 0.5)} x2={x(due + 0.5)} y1={M.top} y2={H - M.bottom} stroke={STATUS.warning} strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={x(due + 0.5) + 6} y={M.top + 12} fontSize={10.5} fill={STATUS.warning}>
              {dueLabel}
            </text>
            {[1, 5, 10, 15, 20, 25, 31].map((d) => (
              <text key={d} x={x(d)} y={H - M.bottom + 14} textAnchor="middle" fontSize={10} fill={INK.muted}>
                {d}
              </text>
            ))}
            <text x={(M.left + w - M.right) / 2} y={H - 2} textAnchor="middle" fontSize={10} fill={INK.secondary}>
              {xLabel}
            </text>
            {y.ticks(5).map((v) => (
              <text key={v} x={M.left - 6} y={y(v)} dy="0.35em" textAnchor="end" fontSize={10} fill={INK.muted}>
                {v}
              </text>
            ))}
            <text transform={`translate(10,${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill={INK.secondary}>
              {yLabel}
            </text>
          </g>
        )
      }}
    </Frame>
  )
}
