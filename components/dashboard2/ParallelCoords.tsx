"use client"

import { useState, type PointerEvent } from "react"
import { scaleLinear, scalePoint } from "d3-scale"
import { BETTER_HIGH, MEASURES, type CompareRow, type Measure } from "@/lib/interno/tablero2-x"
import { INK, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const H = 340
const M = { top: 46, bottom: 30 }

/** The four biggest deployments keep a categorical color; the rest are gray (never a fifth hue). */
export const compareColor = (i: number) => SERIES[i] ?? "#6f6e69"

/**
 * Deployments side by side: one vertical axis per measure, "better" always up (an arrow says when that means less),
 * every deployment a line across them. Lines that stay high are healthy all round; a dive shows where one falls
 * behind. Hover a line, or its name above, to bring it forward with its numbers.
 */
export function ParallelCoords({ rows, label, axisLabel, fmt, better }: { rows: CompareRow[]; label: string; axisLabel: (m: Measure) => string; fmt: (m: Measure, v: number) => string; better: { high: string; low: string } }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
        {rows.map((r, i) => (
          <li key={r.id}>
            <button type="button" onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(r.id)} onBlur={() => setHover(null)} className="inline-flex items-center gap-1.5 rounded px-1 hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: compareColor(i) }} />
              {r.name}
            </button>
          </li>
        ))}
      </ul>
      <Frame height={H} label={label}>
        {(w, tip) => {
          const pad = w < 520 ? 18 : 40
          const x = scalePoint<Measure>().domain([...MEASURES]).range([pad, w - pad])
          const scales = Object.fromEntries(
            MEASURES.map((m) => {
              const vs = rows.map((r) => r.values[m]).filter((v): v is number => v !== null)
              let lo = Math.min(...vs)
              let hi = Math.max(...vs)
              if (!vs.length) [lo, hi] = [0, 1]
              if (lo === hi) [lo, hi] = [lo - Math.abs(lo || 1) * 0.1, hi + Math.abs(hi || 1) * 0.1]
              const span = hi - lo
              return [m, scaleLinear().domain([lo - span * 0.08, hi + span * 0.08]).range(BETTER_HIGH[m] ? [H - M.bottom, M.top] : [M.top, H - M.bottom])]
            })
          ) as Record<Measure, ReturnType<typeof scaleLinear<number, number>>>
          const order = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.id === hover) - Number(b.r.id === hover))
          return (
            <g>
              {MEASURES.map((m) => {
                const s = scales[m]
                // The axis ends are labelled with the real lowest and highest values (the scale is padded a little).
                const vs = rows.map((r) => r.values[m]).filter((v): v is number => v !== null)
                const [d0, d1] = vs.length ? [Math.min(...vs), Math.max(...vs)] : s.domain()
                const ax = x(m) ?? 0
                return (
                  <g key={m}>
                    <line x1={ax} x2={ax} y1={M.top} y2={H - M.bottom} stroke={INK.axis} strokeWidth={1.5} />
                    {/* On a phone the names alternate between two rows (they'd touch on one); the note explains "better is up". */}
                    <text x={ax} y={w < 520 ? (MEASURES.indexOf(m) % 2 ? 26 : 12) : 12} textAnchor="middle" fontSize={w < 520 ? 9.5 : 10.5} fill={INK.primary}>
                      {axisLabel(m)}
                    </text>
                    {w >= 520 && (
                      <text x={ax} y={26} textAnchor="middle" fontSize={9} fill={INK.muted}>
                        ↑ {BETTER_HIGH[m] ? better.high : better.low}
                      </text>
                    )}
                    {w >= 520 && (
                      <>
                        <text x={ax + 4} y={s(BETTER_HIGH[m] ? d1 : d0) - 4} fontSize={9} fill={INK.muted}>
                          {fmt(m, BETTER_HIGH[m] ? d1 : d0)}
                        </text>
                        <text x={ax + 4} y={s(BETTER_HIGH[m] ? d0 : d1) + 12} fontSize={9} fill={INK.muted}>
                          {fmt(m, BETTER_HIGH[m] ? d0 : d1)}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}
              {order.map(({ r, i }) => {
                const pts = MEASURES.map((m) => (r.values[m] === null ? null : ([x(m) ?? 0, scales[m](r.values[m] as number)] as const)))
                let d = ""
                pts.forEach((p, k) => {
                  if (!p) return
                  d += `${k === 0 || !pts[k - 1] ? "M" : "L"}${p[0]},${p[1]}`
                })
                const on = hover === null || hover === r.id
                const color = compareColor(i)
                const enter = (e: PointerEvent<Element>) => {
                  setHover(r.id)
                  tip.show(e, <TipBody title={r.name} rows={MEASURES.filter((m) => r.values[m] !== null).map((m) => ({ label: axisLabel(m), value: fmt(m, r.values[m] as number), color }))} />)
                }
                return (
                  <g key={r.id} opacity={on ? 1 : 0.15} style={{ transition: "opacity 200ms" }}>
                    <path d={d} fill="none" stroke={color} strokeWidth={hover === r.id ? 3.5 : 2} strokeLinejoin="round" className="t2-draw" pathLength={1} />
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onPointerMove={enter}
                      onPointerLeave={() => {
                        setHover(null)
                        tip.hide()
                      }}
                    />
                    {pts.map((p, k) => (p ? <circle key={k} cx={p[0]} cy={p[1]} r={hover === r.id ? 4.5 : 3} fill={color} stroke={INK.surface} strokeWidth={1.5} className="pointer-events-none" /> : null))}
                  </g>
                )
              })}
            </g>
          )
        }}
      </Frame>
    </div>
  )
}
