"use client"

import { useState } from "react"
import type { Star } from "@/lib/interno/tablero2-more"
import { INK } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const TURNS = 2.6

/**
 * The client galaxy: every client on a spiral by the day they started, the first one at the center and the newest on
 * the outer arm; the dot's size is what they pay, its color their plan; those who left stay as empty rings. The arm
 * gets crowded where the business grew fast. Labels mark the turn of each year.
 */
export function TenureGalaxy({ stars, today, label, color, center, centerHint, tipRows }: { stars: Star[]; today: string; label: string; color: (s: Star) => string; center: string; centerHint: string; tipRows: (s: Star) => { title: string; rows: { label: string; value: string }[] } }) {
  const [hover, setHover] = useState<number | null>(null)
  const t0 = Date.parse(stars[0]?.start ?? today)
  const t1 = Math.max(t0 + 864e5, Date.parse(today))
  const years: string[] = []
  for (let y = Number(stars[0]?.start.slice(0, 4) ?? today.slice(0, 4)) + 1; y <= Number(today.slice(0, 4)); y++) years.push(`${y}-01-01`)
  return (
    <Frame square height={(w) => Math.min(w, 500)} label={label}>
      {(size, tip) => {
        const c = size / 2
        const r0 = size * 0.1
        const R = size / 2 - 14
        const pos = (date: string, lift = 0) => {
          const t = (Date.parse(date) - t0) / (t1 - t0)
          const a = t * TURNS * Math.PI * 2 - Math.PI / 2
          const rad = r0 + (R - r0) * t + lift
          return { x: c + rad * Math.cos(a), y: c + rad * Math.sin(a) }
        }
        const guide = Array.from({ length: 220 }, (_, i) => {
          const t = i / 219
          const a = t * TURNS * Math.PI * 2 - Math.PI / 2
          const rad = r0 + (R - r0) * t
          return `${i ? "L" : "M"}${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`
        }).join("")
        const size1 = (m: number) => 1.6 + Math.sqrt(Math.max(0, m) / 600) * (size < 420 ? 3.2 : 4.4)
        // Clients who started the same week sit side by side across the arm, not on top of each other.
        const seen = new Map<string, number>()
        const placed = stars.map((s) => {
          const wk = s.start.slice(0, 8) + String(Math.floor(Number(s.start.slice(8)) / 7))
          const n = seen.get(wk) ?? 0
          seen.set(wk, n + 1)
          const lift = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * (size < 420 ? 4 : 5.5)
          return { s, ...pos(s.start, lift) }
        })
        return (
          <g>
            <defs>
              <radialGradient id="t2-galaxy">
                <stop offset="0%" stopColor="#5598e7" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#5598e7" stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={c} cy={c} r={r0 * 2.2} fill="url(#t2-galaxy)" />
            <path d={guide} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} strokeLinecap="round" />
            <path d={guide} fill="none" stroke={INK.grid} strokeWidth={1} strokeDasharray="1 3" />
            {years.map((y) => {
              const p = pos(y, 14)
              return (
                <text key={y} x={p.x} y={p.y} textAnchor="middle" dy="0.35em" fontSize={10} fill={INK.muted} stroke={INK.surface} strokeWidth={3} paintOrder="stroke">
                  {y.slice(0, 4)}
                </text>
              )
            })}
            {placed.map(({ s, x, y }, i) => {
              const r = size1(s.monthly)
              const dim = hover !== null && hover !== i
              return (
                <g
                  key={s.id}
                  opacity={dim ? 0.35 : 1}
                  onPointerMove={(e) => {
                    setHover(i)
                    const t = tipRows(s)
                    tip.show(e, <TipBody title={t.title} rows={t.rows} />)
                  }}
                  onPointerLeave={() => {
                    setHover(null)
                    tip.hide()
                  }}
                >
                  <circle cx={x} cy={y} r={r + 4} fill="transparent" />
                  {s.live ? <circle cx={x} cy={y} r={r} fill={color(s)} className="t2-fade" style={{ animationDelay: `${Math.min(1600, i * 6)}ms` }} /> : <circle cx={x} cy={y} r={r} fill="none" stroke={INK.muted} strokeWidth={1} className="t2-fade" style={{ animationDelay: `${Math.min(1600, i * 6)}ms` }} />}
                </g>
              )
            })}
            {stars.length > 0 && (
              <g className="pointer-events-none" textAnchor="middle">
                <text x={c} y={c + 2} fontSize={Math.max(14, size * 0.05)} fontWeight={300} fill={INK.primary}>
                  {center}
                </text>
                <text x={c} y={c + 16} fontSize={9} letterSpacing="0.08em" fill={INK.muted}>
                  {centerHint}
                </text>
              </g>
            )}
          </g>
        )
      }}
    </Frame>
  )
}
