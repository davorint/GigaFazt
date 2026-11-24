"use client"

import { useState } from "react"
import { arc } from "d3-shape"
import { scaleLinear } from "d3-scale"
import { INK, SEQUENTIAL } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const TAU = Math.PI * 2
/** A gap at midnight holds the weekday names; the 24 hours share the rest of the circle. */
const GAP = 0.34
const ang = (h: number) => GAP / 2 + (h / 24) * (TAU - GAP)

/**
 * The network's week as a 24-hour clock: midnight at the top, one ring per weekday (Monday inside, Sunday outside), each
 * cell the average traffic of that hour (the weekday names sit in a gap at midnight). A hand marks the hour now (Mexico City); the center names the busiest hour.
 */
export function RadialClock({ heat, label, days, nowHour, peakLabel, unit, noData }: { heat: (number | null)[][]; label: string; days: string[]; nowHour: number | null; peakLabel: string; unit: string; noData: string }) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  const max = Math.max(1, ...heat.flat().filter((v): v is number => v !== null))
  const color = scaleLinear<string>()
    .domain(SEQUENTIAL.map((_, i) => (i / (SEQUENTIAL.length - 1)) * max))
    .range([...SEQUENTIAL])
  let peak: { d: number; h: number; v: number } | null = null
  heat.forEach((row, d) => row.forEach((v, h) => v !== null && (!peak || v > peak.v) && (peak = { d, h, v })))
  const p = peak as { d: number; h: number; v: number } | null
  const shown = hover ? { d: hover[0], h: hover[1], v: heat[hover[0]][hover[1]] } : p
  return (
    <Frame square height={(w) => Math.min(w, 460)} label={label}>
      {(size, tip) => {
        const c = size / 2
        const outer = c - 22
        const inner = outer * 0.34
        const ring = (outer - inner) / 7
        const a = arc<{ d: number; h: number }>()
          .innerRadius((x) => inner + x.d * ring + 1)
          .outerRadius((x) => inner + (x.d + 1) * ring - 1)
          .startAngle((x) => ang(x.h))
          .endAngle((x) => ang(x.h + 1))
          .padAngle(0.012)
          .cornerRadius(2)
        const handA = nowHour === null ? null : ang(nowHour + 0.5)
        return (
          <g transform={`translate(${c},${c})`}>
            {heat.map((row, d) =>
              row.map((v, h) => (
                <path
                  key={`${d}-${h}`}
                  d={a({ d, h }) ?? ""}
                  fill={v === null ? "rgba(255,255,255,0.03)" : color(v)}
                  stroke={hover && hover[0] === d && hover[1] === h ? INK.primary : "none"}
                  strokeWidth={1.5}
                  className="t2-fade"
                  style={{ animationDelay: `${(h * 7 + d) * 4}ms` }}
                  onPointerMove={(e) => {
                    setHover([d, h])
                    tip.show(e, <TipBody title={`${days[d]} · ${h}:00–${h + 1}:00`} rows={[{ label: "", value: v === null ? noData : `${v.toLocaleString("es-MX")} ${unit}`, color: v === null ? undefined : color(v) }]} />)
                  }}
                  onPointerLeave={() => {
                    setHover(null)
                    tip.hide()
                  }}
                />
              ))
            )}
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
              const a0 = ang(h) - Math.PI / 2
              return (
                <text key={h} x={Math.cos(a0) * (outer + 12)} y={Math.sin(a0) * (outer + 12)} dy="0.35em" textAnchor="middle" fontSize={10} fill={INK.muted}>
                  {h}h
                </text>
              )
            })}
            {ring >= 11 &&
              days.map((dl, d) => (
                <text key={dl} x={0} y={-(inner + (d + 0.5) * ring)} dy="0.35em" textAnchor="middle" fontSize={Math.min(9, ring * 0.62)} fill={INK.secondary} className="pointer-events-none">
                  {dl}
                </text>
              ))}
            {handA !== null && (
              <g className="pointer-events-none">
                <line x1={Math.sin(handA) * (inner - 4)} y1={-Math.cos(handA) * (inner - 4)} x2={Math.sin(handA) * (outer + 3)} y2={-Math.cos(handA) * (outer + 3)} stroke={INK.primary} strokeWidth={1.5} strokeLinecap="round" opacity={0.85} />
                <circle cx={Math.sin(handA) * (outer + 3)} cy={-Math.cos(handA) * (outer + 3)} r={3} fill={INK.primary} />
              </g>
            )}
            {shown && (
              <g className="pointer-events-none" textAnchor="middle">
                <text y={-inner * 0.28} fontSize={9} letterSpacing="0.08em" fill={INK.muted}>
                  {hover ? `${days[shown.d]} ${shown.h}:00` : peakLabel}
                </text>
                <text y={inner * 0.14} fontSize={Math.max(15, inner * 0.36)} fontWeight={300} fill={INK.primary} className="tabular-nums">
                  {shown.v === null ? "—" : Math.round(shown.v).toLocaleString("es-MX")}
                </text>
                <text y={inner * 0.46} fontSize={9} fill={INK.muted}>
                  {hover ? unit : `${days[shown.d]} ${shown.h}:00 · ${unit}`}
                </text>
              </g>
            )}
          </g>
        )
      }}
    </Frame>
  )
}
