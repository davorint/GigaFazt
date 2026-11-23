"use client"

import { useState } from "react"
import { scaleLinear, scaleTime } from "d3-scale"
import { area, curveMonotoneX, line } from "d3-shape"
import type { Forecast } from "@/lib/interno/tablero2-net"
import { FULL_SHARE } from "@/lib/wispdavor/capacity"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

const H = 320
const SOON = 60
/** Full now, full within SOON days, or calm: the line's state (neutral when calm). */
export const forecastColor = (f: Forecast) => (f.full ? STATUS.critical : f.eta !== null && f.eta <= SOON ? STATUS.serious : "#6f6e69")

const at = (day: string) => Date.parse(`${day}T12:00:00Z`)

/**
 * When each link fills up (the suggestion): every deployment's daily busy-hour use of its links (60 days), its trend
 * carried forward as a dashed line with a widening band, and a marker where it crosses FULL_SHARE with the date. Full and
 * soon-full deployments are colored; the rest stay gray. An estimate: it assumes the next weeks grow like the last six.
 */
export function SaturationForecast({ rows, today, label, name, tipFor, fullLabel }: { rows: Forecast[]; today: string; label: string; name: (f: Forecast) => string; tipFor: (f: Forecast) => { title: string; rows: { label: string; value: string }[] }; fullLabel: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const ahead = Math.min(90, Math.max(30, ...rows.filter((f) => f.eta !== null && f.eta <= SOON).map((f) => f.eta as number + 14)))
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        // Room on the right for the names (clipped to fit on a phone).
        const R = w < 520 ? 74 : 168
        const fit = (txt: string) => (txt.length * 6 <= R - 8 ? txt : `${txt.slice(0, Math.max(3, Math.floor((R - 8) / 6) - 1))}…`)
        const t0 = at(today) - 60 * 864e5
        const t1 = at(today) + ahead * 864e5
        const x = scaleTime().domain([new Date(t0), new Date(t1)]).range([30, w - R])
        const top = Math.max(1, ...rows.flatMap((f) => f.history.map((h) => h.use)))
        const y = scaleLinear().domain([0, top * 1.05]).nice().range([H - 26, 12])
        const X = (t: number) => x(new Date(t))
        const hist = line<{ day: string; use: number }>()
          .x((p) => X(at(p.day)))
          .y((p) => y(p.use))
          .curve(curveMonotoneX)
        const order = [...rows].sort((a, b) => Number(forecastColor(a) !== "#6f6e69") - Number(forecastColor(b) !== "#6f6e69"))
        // Names at the right edge, where each line ends, pushed apart so none overlap (13 px apart at least).
        const ends = rows
          .map((f) => {
            const end = f.eta !== null && !f.full ? Math.min(ahead, f.eta + 10) : ahead
            return { id: f.siteId, y: y(Math.max(0, Math.min(top * 1.05, f.level + f.slope * end))) }
          })
          .concat([{ id: "__full", y: y(FULL_SHARE) }])
          .sort((a, b) => a.y - b.y)
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13
        const labelY = new Map(ends.map((e) => [e.id, e.y]))
        return (
          <g>
            {y.ticks(5).map((v) => (
              <g key={v}>
                <line x1={30} x2={w - R} y1={y(v)} y2={y(v)} stroke={INK.grid} />
                <text x={24} y={y(v)} dy="0.35em" textAnchor="end" fontSize={10} fill={INK.muted}>
                  {Math.round(v * 100)}%
                </text>
              </g>
            ))}
            {x.ticks(w < 520 ? 4 : 8).map((d) => (
              <text key={d.getTime()} x={x(d)} y={H - 8} textAnchor="middle" fontSize={10} fill={d.getTime() > at(today) ? INK.secondary : INK.muted}>
                {d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
              </text>
            ))}
            <rect x={X(at(today))} y={12} width={w - R - X(at(today))} height={H - 38} fill="rgba(255,255,255,0.025)" />
            <line x1={X(at(today))} x2={X(at(today))} y1={12} y2={H - 26} stroke={INK.axis} strokeDasharray="3 3" />
            <line x1={30} x2={w - R} y1={y(FULL_SHARE)} y2={y(FULL_SHARE)} stroke={STATUS.critical} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={w - R + 4} y={labelY.get("__full")} dy="0.35em" fontSize={10} fill={STATUS.critical}>
              {fullLabel}
            </text>
            {order.map((f) => {
              const color = forecastColor(f)
              const on = hover === null || hover === f.siteId
              const end = f.eta !== null ? Math.min(ahead, f.eta + 10) : ahead
              const proj = Array.from({ length: 13 }, (_, i) => {
                const k = (i / 12) * end
                return { k, v: f.level + f.slope * k, s: f.sd * (1 + k / 30) * 1.5 }
              })
              const band = area<(typeof proj)[number]>()
                .x((p) => X(at(today) + p.k * 864e5))
                .y0((p) => y(Math.max(0, p.v - p.s)))
                .y1((p) => y(p.v + p.s))
              const trend = line<(typeof proj)[number]>()
                .x((p) => X(at(today) + p.k * 864e5))
                .y((p) => y(Math.max(0, Math.min(top * 1.05, p.v))))
              const last = f.history[f.history.length - 1]
              const cross = f.eta !== null && !f.full ? at(today) + f.eta * 864e5 : null
              const t = tipFor(f)
              return (
                <g
                  key={f.siteId}
                  opacity={on ? 1 : 0.18}
                  style={{ transition: "opacity 200ms" }}
                  onPointerMove={(e) => {
                    setHover(f.siteId)
                    tip.show(e, <TipBody title={t.title} rows={t.rows} />)
                  }}
                  onPointerLeave={() => {
                    setHover(null)
                    tip.hide()
                  }}
                >
                  {color !== "#6f6e69" && <path d={band(proj) ?? ""} fill={color} opacity={0.14} />}
                  <path d={hist(f.history) ?? ""} fill="none" stroke={color} strokeWidth={color === "#6f6e69" ? 1.5 : 2} className="t2-draw" pathLength={1} />
                  <path d={hist(f.history) ?? ""} fill="none" stroke="transparent" strokeWidth={14} />
                  <path d={trend(proj) ?? ""} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="5 4" />
                  {last && (
                    <text x={w - R + 4} y={labelY.get(f.siteId)} dy="0.35em" fontSize={10.5} fill={color === "#6f6e69" ? INK.secondary : color}>
                      {fit(name(f))}
                    </text>
                  )}
                  {cross !== null && cross <= t1 && (
                    <g>
                      <circle cx={X(cross)} cy={y(FULL_SHARE)} r={5} fill={color} stroke={INK.surface} strokeWidth={2} />
                      <circle cx={X(cross)} cy={y(FULL_SHARE)} r={5} fill="none" stroke={color} className="t2-ping" />
                      <text x={X(cross)} y={y(FULL_SHARE) - 12} textAnchor="middle" fontSize={10.5} fill={INK.primary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke">
                        {new Date(cross).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
