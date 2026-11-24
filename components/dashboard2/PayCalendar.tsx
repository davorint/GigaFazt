"use client"

import { scaleBand, scaleLinear } from "d3-scale"
import type { PayDay } from "@/lib/interno/tablero2"
import { mxn } from "@/lib/materials/catalog"
import { INK, SEQUENTIAL, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const dayTitle = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })

/** Payments per day, one column per week (Monday on top), like a contributions calendar. */
export function PayCalendar({ days, label, dayLetters, paymentsLabel }: { days: PayDay[]; label: string; dayLetters: string[]; paymentsLabel: (n: number) => string }) {
  const weeks = Math.ceil(days.length / 7)
  const max = Math.max(1, ...days.map((d) => d.n))
  const color = scaleLinear<string>()
    .domain([1, ...SEQUENTIAL.slice(2).map((_, i) => 1 + ((i + 1) / (SEQUENTIAL.length - 2)) * (max - 1))])
    .range([...SEQUENTIAL.slice(1)])
    .clamp(true)
  return (
    <Frame height={(w) => Math.min(22, (w - 18) / weeks - 3) * 7 + 3 * 6 + 20} label={label}>
      {(w, tip) => {
        // Weeks stretch to the full width; days stay at most 22 px tall.
        const cw = (w - 18) / weeks - 3
        const cell = Math.min(22, cw)
        const left = 16
        return (
          <g>
            {dayLetters.map((l, i) =>
              i % 2 ? null : (
                <text key={i} x={0} y={18 + i * (cell + 3) + cell / 2} dy="0.35em" fontSize={9} fill={INK.muted}>
                  {l}
                </text>
              )
            )}
            {days.map((d, i) => {
              const wk = Math.floor(i / 7)
              const x = left + wk * (cw + 3)
              const y = 18 + (i % 7) * (cell + 3)
              const m = d.day.slice(0, 7)
              // A month's name over the first week column that starts in it.
              const head = i % 7 === 0 && (i === 0 ? Number(d.day.slice(8)) <= 7 : days[i - 7].day.slice(0, 7) !== m)
              return (
                <g key={d.day} onPointerMove={(e) => tip.show(e, <TipBody title={dayTitle(d.day)} rows={[{ label: paymentsLabel(d.n), value: mxn(d.amount) }]} />)} onPointerLeave={tip.hide}>
                  {head && (
                    <text x={x} y={10} fontSize={10} fill={INK.muted}>
                      {new Date(`${d.day}T12:00:00`).toLocaleDateString("es-MX", { month: "short" })}
                    </text>
                  )}
                  <rect x={x} y={y} width={cw} height={cell} rx={3} fill={d.n ? color(d.n) : "rgba(255,255,255,0.04)"} className="t2-fade" style={{ animationDelay: `${wk * 12}ms` }} />
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}

/** Payments by day of the month, the run that holds most of them marked. */
export function PayDays({ counts, window: win, label, dayLabel }: { counts: number[]; window: { from: number; to: number } | null; label: string; dayLabel: (d: number, n: number) => string }) {
  return (
    <Frame height={96} label={label}>
      {(w, tip) => {
        const x = scaleBand<number>()
          .domain(counts.map((_, i) => i + 1))
          .range([0, w])
          .paddingInner(0.25)
        const y = scaleLinear()
          .domain([0, Math.max(1, ...counts)])
          .range([0, 62])
        return (
          <g>
            {/* The busiest run; across the month's end it is two pieces (from its start to 31, and from 1). */}
            {win &&
              (win.from <= win.to ? [[win.from, win.to]] : [[win.from, counts.length], [1, win.to]]).map(([a, b]) => (
                <rect key={a} x={(x(a) ?? 0) - 2} y={0} width={(x(b) ?? 0) + x.bandwidth() - (x(a) ?? 0) + 4} height={74} rx={6} fill={SERIES[0]} opacity={0.1} />
              ))}
            {counts.map((n, i) => {
              const d = i + 1
              const hgt = n ? Math.max(3, y(n)) : 0
              const inWin = win && (win.from <= win.to ? d >= win.from && d <= win.to : d >= win.from || d <= win.to)
              return (
                <g key={d} onPointerMove={(e) => tip.show(e, <TipBody title={dayLabel(d, n)} rows={[]} />)} onPointerLeave={tip.hide}>
                  <rect x={x(d)} y={0} width={x.bandwidth()} height={74} fill="transparent" />
                  {n > 0 && <rect x={x(d)} y={70 - hgt} width={x.bandwidth()} height={hgt} rx={Math.min(3, x.bandwidth() / 2)} fill={inWin ? SERIES[0] : "#4a4a47"} className="t2-rise" style={{ animationDelay: `${i * 14}ms` }} />}
                  {(d === 1 || d % 5 === 0) && (
                    <text x={(x(d) ?? 0) + x.bandwidth() / 2} y={90} textAnchor="middle" fontSize={10} fill={INK.muted}>
                      {d}
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={0} x2={w} y1={70.5} y2={70.5} stroke={INK.axis} />
          </g>
        )
      }}
    </Frame>
  )
}
