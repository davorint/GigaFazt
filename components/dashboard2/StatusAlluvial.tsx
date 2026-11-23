"use client"

import { useState } from "react"
import { FLOW_STATES, type FlowState, type StatusFlows } from "@/lib/interno/tablero2-more"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { short } from "./format"

/** How a client stands (status colors); a cancellation is a dark neutral, not a status. */
export const FLOW_COLOR: Record<FlowState, string> = { "al-corriente": STATUS.good, "por-vencer": STATUS.warning, atrasado: STATUS.serious, "sin-cobro": INK.muted, baja: "#4a4a47" }

const H = 320

/**
 * Every client's standing month by month: a column per month, a block per status (height = clients), ribbons for the
 * clients who went from one to another. A block taller than the ribbons reaching it holds the clients who arrived
 * that month. Staying in the same state is a quiet gray band; a change of state carries the colors. Hover a ribbon or
 * a block for the count.
 */
export function StatusAlluvial({ flows, label, stateLabel, clientsLabel }: { flows: StatusFlows; label: string; stateLabel: (s: FlowState) => string; clientsLabel: (n: number) => string }) {
  const [hover, setHover] = useState<string | null>(null)
  const cols = flows.months.length
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const top = 22
        const nodeW = 12
        const left = w < 520 ? 4 : 92
        const xs = flows.months.map((_, i) => left + (i * (w - left - nodeW - 4)) / Math.max(1, cols - 1))
        const gap = 6
        const most = Math.max(1, ...flows.counts.map((c) => FLOW_STATES.reduce((a, s) => a + c[s], 0)))
        const kk = (H - top - 8 - gap * (FLOW_STATES.length - 1)) / most
        // Block positions per column (statuses in a fixed order, top to bottom).
        const blocks = flows.counts.map((c) => {
          let y = top
          return Object.fromEntries(
            FLOW_STATES.map((s) => {
              const b = { y, h: c[s] * kk }
              y += c[s] * kk + (c[s] ? gap : 0)
              return [s, b]
            })
          ) as Record<FlowState, { y: number; h: number }>
        })
        const outY = blocks.map((b) => Object.fromEntries(FLOW_STATES.map((s) => [s, b[s].y])) as Record<FlowState, number>)
        const inY = blocks.map((b) => Object.fromEntries(FLOW_STATES.map((s) => [s, b[s].y])) as Record<FlowState, number>)
        const links = [...flows.links].sort((a, b) => a.from - b.from || FLOW_STATES.indexOf(a.a) - FLOW_STATES.indexOf(b.a) || FLOW_STATES.indexOf(a.b) - FLOW_STATES.indexOf(b.b))
        const ribbons = links.map((l) => {
          const h = l.n * kk
          const y0 = outY[l.from][l.a]
          outY[l.from][l.a] += h
          const y1 = inY[l.from + 1][l.b]
          inY[l.from + 1][l.b] += h
          const x0 = xs[l.from] + nodeW
          const x1 = xs[l.from + 1]
          const mx = (x0 + x1) / 2
          return { l, id: `${l.from}|${l.a}|${l.b}`, d: `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}L${x1},${y1 + h}C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h}Z`, x0, x1 }
        })
        return (
          <g>
            <defs>
              {FLOW_STATES.flatMap((a) =>
                FLOW_STATES.map((b) => (
                  <linearGradient key={`${a}-${b}`} id={`t2-al-${a}-${b}`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={FLOW_COLOR[a]} />
                    <stop offset="100%" stopColor={FLOW_COLOR[b]} />
                  </linearGradient>
                ))
              )}
            </defs>
            {flows.months.map((m, i) => (
              <text key={m} x={xs[i] + nodeW / 2} y={12} textAnchor={i === 0 && left < 10 ? "start" : i === cols - 1 ? "end" : "middle"} fontSize={10} fill={INK.muted}>
                {short(m)}
              </text>
            ))}
            {ribbons.map((r) => (
              <path
                key={r.id}
                d={r.d}
                fill={r.l.a === r.l.b ? "#ffffff" : `url(#t2-al-${r.l.a}-${r.l.b})`}
                opacity={r.l.a === r.l.b ? (hover === r.id ? 0.16 : 0.055) : hover === null ? 0.72 : hover === r.id ? 0.95 : 0.12}
                style={{ transition: "opacity 200ms" }}
                className="t2-fade"
                onPointerMove={(e) => {
                  setHover(r.id)
                  tip.show(e, <TipBody title={`${stateLabel(r.l.a)} → ${stateLabel(r.l.b)}`} rows={[{ label: `${short(flows.months[r.l.from])} → ${short(flows.months[r.l.from + 1])}`, value: clientsLabel(r.l.n) }]} />)
                }}
                onPointerLeave={() => {
                  setHover(null)
                  tip.hide()
                }}
              />
            ))}
            {blocks.map((b, i) =>
              FLOW_STATES.map((s) =>
                flows.counts[i][s] ? (
                  <g key={`${i}-${s}`} onPointerMove={(e) => tip.show(e, <TipBody title={`${stateLabel(s)} · ${short(flows.months[i])}`} rows={[{ label: "", value: clientsLabel(flows.counts[i][s]), color: FLOW_COLOR[s] }]} />)} onPointerLeave={tip.hide}>
                    <rect x={xs[i]} y={b[s].y} width={nodeW} height={Math.max(2, b[s].h)} rx={3} fill={FLOW_COLOR[s]} />
                    {i === 0 && left > 10 && b[s].h >= 9 && (
                      <text x={xs[i] - 8} y={b[s].y + b[s].h / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={INK.secondary}>
                        {stateLabel(s)} <tspan fill={INK.primary}>{flows.counts[i][s]}</tspan>
                      </text>
                    )}
                    {i === cols - 1 && b[s].h >= 9 && (
                      <text x={xs[i] - 5} y={b[s].y + b[s].h / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={INK.primary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke" className="pointer-events-none tabular-nums">
                        {flows.counts[i][s]}
                      </text>
                    )}
                  </g>
                ) : null
              )
            )}
          </g>
        )
      }}
    </Frame>
  )
}
