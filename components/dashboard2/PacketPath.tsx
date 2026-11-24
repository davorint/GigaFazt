"use client"

import { Globe, House, Router, Waypoints } from "lucide-react"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame } from "./Frame"
import { clipName } from "./format"

export type PathRow = { key: string; name: string; carrier: string; ont: number | null; ontP90: number | null; gateway: number | null; lossNote: string }
const ROW = 84
/** On a phone the hops are short: names go under the icons and the ONT figures on a line of their own. */
const rowOf = (w: number) => (w < 520 ? 104 : ROW)

/** Latency of a hop as a state: inside the building a couple of ms is normal, to the carrier about ten. */
const tone = (ms: number | null, ok: number, tight: number) => (ms === null ? INK.muted : ms < ok ? STATUS.good : ms < tight ? STATUS.warning : STATUS.serious)

/**
 * The packet's path per deployment: the client's ONT → our router → the carrier's gateway → Internet, with the median
 * latency of each hop we measure (the ONT's 90th percentile beside it) and how many ONTs lost pings. Packets flow along
 * the line (decoration, still under reduced motion); its color is the hop's state.
 */
export function PacketPath({ rows, label, names, ms }: { rows: PathRow[]; label: string; names: { home: string; router: string; internet: string; unmeasured: string }; ms: (v: number) => string }) {
  return (
    <Frame height={(w) => rows.length * rowOf(w) + 4} label={label}>
      {(w) => {
        const narrow = w < 520
        const RH = rowOf(w)
        const xs = [0.05, 0.37, 0.69, 0.95].map((f) => f * w)
        const icons = [House, Router, Waypoints, Globe]
        return (
          <g>
            {rows.map((r, ri) => {
              const y = ri * RH + 40
              const segs = [
                { from: 0, color: tone(r.ont, 2, 5), top: r.ont === null ? names.unmeasured : `${ms(r.ont)}${r.ontP90 !== null && !narrow ? ` · p90 ${ms(r.ontP90)}` : ""}`, bottom: narrow ? "" : r.lossNote },
                { from: 1, color: tone(r.gateway, 10, 25), top: r.gateway === null ? names.unmeasured : ms(r.gateway), bottom: "" },
                { from: 2, color: INK.muted, top: "", bottom: "" },
              ]
              const nodeNames = [names.home, names.router, r.carrier, names.internet]
              return (
                <g key={r.key}>
                  <text x={2} y={y - 28} fontSize={11.5} fill={INK.primary}>
                    {r.name}
                  </text>
                  {segs.map((s) => (
                    <g key={s.from}>
                      <line x1={xs[s.from] + 14} x2={xs[s.from + 1] - 14} y1={y} y2={y} stroke={s.color} strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
                      <line x1={xs[s.from] + 14} x2={xs[s.from + 1] - 14} y1={y} y2={y} stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeDasharray={s.from === 2 ? "2 6" : "3 11"} className={s.from === 2 ? undefined : "t2-flow"} />
                      {s.top && (
                        <text x={(xs[s.from] + xs[s.from + 1]) / 2} y={y - 9} textAnchor="middle" fontSize={11} fill={INK.primary} className="font-mono tabular-nums">
                          {s.top}
                        </text>
                      )}
                      {s.bottom && (
                        <text x={(xs[s.from] + xs[s.from + 1]) / 2} y={y + 18} textAnchor="middle" fontSize={10} fill={INK.muted}>
                          {s.bottom}
                        </text>
                      )}
                    </g>
                  ))}
                  {xs.map((cx, i) => {
                    const Icon = icons[i]
                    return (
                      <g key={i}>
                        <circle cx={cx} cy={y} r={13} fill={INK.surface} stroke="rgba(255,255,255,0.22)" />
                        <Icon x={cx - 7} y={y - 7} width={14} height={14} color={INK.secondary} strokeWidth={1.75} aria-hidden />
                        {/* On a phone the outer names hug the edges and every name fits its share of the width. */}
                        <text x={narrow && i === 0 ? 2 : narrow && i === xs.length - 1 ? w - 2 : cx} y={y + 30} textAnchor={narrow && i === 0 ? "start" : narrow && i === xs.length - 1 ? "end" : "middle"} fontSize={narrow ? 9.5 : 10} fill={INK.muted}>
                          {narrow ? clipName(nodeNames[i], Math.floor((i === 0 || i === xs.length - 1 ? 0.2 : 0.3) * w / 5.4)) : nodeNames[i]}
                        </text>
                      </g>
                    )
                  })}
                  {narrow && (r.lossNote || r.ontP90 !== null) && (
                    <text x={2} y={y + 46} fontSize={10} fill={INK.muted}>
                      {[r.ontP90 !== null ? `p90 ${ms(r.ontP90)}` : "", r.lossNote].filter(Boolean).join(" · ")}
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
