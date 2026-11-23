"use client"

import { scaleLinear } from "d3-scale"
import { MARGIN, ONT_OVERLOAD, ONT_SENSITIVITY, type LightStatus } from "@/lib/clients/optics"
import { dodge, type LightDot, type LightRow } from "@/lib/interno/tablero2-more"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

export const LIGHT_COLOR: Record<LightStatus, string> = { bien: STATUS.good, justo: STATUS.warning, baja: STATUS.critical, satura: STATUS.serious }
const LO = -32
const HI = -6
/** A drop this big since the first reading draws the tail (where the light was). */
const TAIL = 2

type Laid = { rows: { row: LightRow; y: number; h: number; ys: number[] }[]; height: number; r: number }

function lay(rows: LightRow[], w: number): Laid {
  const r = w < 520 ? 3.25 : 4.5
  const x = scaleLinear().domain([LO, HI]).range([8, w - 8]).clamp(true)
  let y = 34
  const out = rows.map((row) => {
    const ys = dodge(
      row.dots.map((d) => x(d.rx)),
      r
    )
    const half = Math.max(r, ...ys.map((v) => Math.abs(v) + r))
    const h = half * 2 + 22
    const item = { row, y: y + 16 + half, h, ys }
    y += h + 6
    return item
  })
  return { rows: out, height: y + 18, r }
}

/**
 * The light constellation: every ONT's received power, one row per deployment, against the zones the ONT accepts
 * (too low, close to the limit, good, too strong). An ONT whose light fell since its first reading trails a line back
 * to where it was. Hover a dot for the client's place, plan and readings.
 */
export function LightSwarm({ rows, label, name, zoneLabel, unknownPlace, dotTitle }: { rows: LightRow[]; label: string; name: (r: LightRow) => string; zoneLabel: (s: LightStatus) => string; unknownPlace: string; dotTitle: (d: LightDot) => { rx: string; drop: string | null } }) {
  // The layout depends on the width (the swarm is placed in pixels); it is cheap enough to compute per draw.
  const at = (w: number) => lay(rows, w)
  return (
    <Frame height={(w) => (w ? at(w).height : 200)} label={label}>
      {(w, tip) => {
        const L = at(w)
        const x = scaleLinear().domain([LO, HI]).range([8, w - 8]).clamp(true)
        const zones: [LightStatus, number, number][] = [
          ["baja", LO, ONT_SENSITIVITY],
          ["justo", ONT_SENSITIVITY, ONT_SENSITIVITY + MARGIN],
          ["bien", ONT_SENSITIVITY + MARGIN, ONT_OVERLOAD],
          ["satura", ONT_OVERLOAD, HI],
        ]
        return (
          <g>
            <defs>
              {(["bien", "justo", "baja", "satura"] as const).map((z) => (
                <linearGradient key={z} id={`t2-tail-${z}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={LIGHT_COLOR[z]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={LIGHT_COLOR[z]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            {zones.map(([z, a, b]) => (
              <g key={z}>
                <rect x={x(a)} y={22} width={x(b) - x(a)} height={L.height - 40} fill={LIGHT_COLOR[z]} opacity={z === "bien" ? 0.025 : 0.07} />
                {x(b) - x(a) > 40 && (
                  <text x={(x(a) + x(b)) / 2} y={14} textAnchor="middle" fontSize={10} fill={INK.muted}>
                    {zoneLabel(z)}
                  </text>
                )}
              </g>
            ))}
            {[ONT_SENSITIVITY, ONT_SENSITIVITY + MARGIN, ONT_OVERLOAD].map((v) => (
              <line key={v} x1={x(v)} x2={x(v)} y1={22} y2={L.height - 18} stroke={INK.axis} strokeDasharray="2 3" />
            ))}
            {[-30, -27, -24, -20, -16, -12, -8].map((v) => (
              <text key={v} x={x(v)} y={L.height - 4} textAnchor="middle" fontSize={10} fill={INK.muted}>
                {v}
              </text>
            ))}
            {L.rows.map(({ row, y, ys }, ri) => (
              <g key={row.id || "none"}>
                <text x={8} y={y - (Math.max(...ys.map(Math.abs), 0) + L.r) - 8} fontSize={11} fill={INK.secondary}>
                  {name(row)} <tspan fill={INK.muted}>· {row.dots.length}</tspan>
                </text>
                <line x1={8} x2={w - 8} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
                {row.dots.map((d, i) => {
                  const cx = x(d.rx)
                  const cy = y + ys[i]
                  const tail = d.drop !== null && d.drop >= TAIL && d.first !== null
                  const t = dotTitle(d)
                  return (
                    <g key={d.id} onPointerMove={(e) => tip.show(e, <TipBody title={d.place || unknownPlace} rows={[{ label: d.plan, value: t.rx, color: LIGHT_COLOR[d.status] }, ...(t.drop ? [{ label: "↓", value: t.drop }] : [])]} />)} onPointerLeave={tip.hide}>
                      {/* A thin bar, not a line: a gradient needs a box with height. Strong at the dot, fading toward the first reading. */}
                      {tail && <rect x={cx} y={cy - 1} width={Math.max(0, x(d.first as number) - cx)} height={2} rx={1} fill={`url(#t2-tail-${d.status})`} />}
                      {tail && <circle cx={x(d.first as number)} cy={cy} r={1.5} fill={INK.muted} />}
                      <circle cx={cx} cy={cy} r={L.r + 5} fill="transparent" />
                      <circle cx={cx} cy={cy} r={L.r} fill={LIGHT_COLOR[d.status]} stroke={tail ? INK.primary : INK.surface} strokeWidth={tail ? 1.25 : 1} className="t2-fade" style={{ animationDelay: `${ri * 90 + i * 6}ms` }} />
                    </g>
                  )
                })}
              </g>
            ))}
          </g>
        )
      }}
    </Frame>
  )
}
