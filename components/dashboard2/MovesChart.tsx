"use client"

import { useState } from "react"
import { scaleBand, scaleLinear } from "d3-scale"
import { INK, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { short, signed } from "./format"

export type Move = { month: string; added: number; lost: number }
const H = 240

/** New services up, cancelled down, around one zero line; the month's net above it. */
export function MovesChart({ rows, label, names }: { rows: Move[]; label: string; names: { added: string; lost: string; net: string } }) {
  const [at, setAt] = useState<string | null>(null)
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const m = { top: 18, bottom: 22 }
        const x = scaleBand<string>()
          .domain(rows.map((r) => r.month))
          .range([28, w - 4])
          .paddingInner(0.32)
        const top = Math.max(1, ...rows.map((r) => r.added))
        const bottom = Math.max(1, ...rows.map((r) => r.lost))
        const y = scaleLinear()
          .domain([-bottom, top])
          .nice()
          .range([H - m.bottom, m.top])
        const bw = Math.min(26, x.bandwidth())
        const step = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(w / 64))))
        return (
          <g>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={28} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} />
                <text x={22} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill={INK.muted}>
                  {Math.abs(t)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cx = (x(r.month) ?? 0) + x.bandwidth() / 2
              const net = r.added - r.lost
              const dim = at !== null && at !== r.month
              return (
                <g
                  key={r.month}
                  opacity={dim ? 0.45 : 1}
                  style={{ transition: "opacity 160ms" }}
                  onPointerMove={(e) => {
                    setAt(r.month)
                    tip.show(e, <TipBody title={short(r.month)} rows={[{ label: names.added, value: String(r.added), color: SERIES[0] }, { label: names.lost, value: String(r.lost), color: SERIES[1] }, { label: names.net, value: signed(net) }]} />)
                  }}
                  onPointerLeave={() => {
                    setAt(null)
                    tip.hide()
                  }}
                >
                  <rect x={x(r.month)} y={m.top} width={x.bandwidth()} height={H - m.top - m.bottom} fill="transparent" />
                  {r.added > 0 && <rect x={cx - bw / 2} y={y(r.added)} width={bw} height={Math.max(2, y(0) - y(r.added) - 1)} rx={4} fill={SERIES[0]} className="t2-rise" style={{ animationDelay: `${i * 30}ms` }} />}
                  {r.lost > 0 && <rect x={cx - bw / 2} y={y(0) + 1} width={bw} height={Math.max(2, y(-r.lost) - y(0) - 1)} rx={4} fill={SERIES[1]} className="t2-drop" style={{ animationDelay: `${i * 30}ms` }} />}
                  {(r.added > 0 || r.lost > 0) && x.bandwidth() >= 18 && (
                    <text x={cx} y={y(Math.max(r.added, 0)) - 6} textAnchor="middle" fontSize={10} fill={net < 0 ? INK.secondary : INK.primary} className="tabular-nums">
                      {signed(net)}
                    </text>
                  )}
                  {(i % step === 0 || i === rows.length - 1) && (
                    <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>
                      {short(r.month)}
                    </text>
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
