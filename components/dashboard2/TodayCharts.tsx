"use client"

import { useState } from "react"
import { scaleBand, scaleLinear } from "d3-scale"
import { CHANNELS, MONTH_STATES, OPEN_STAGES, type Channel, type MonthState, type OpenStage, type PayDay, type TicketFigures } from "@/lib/interno/tablero2-today"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"

/** Payment channels: categorical slots in their fixed order. */
export const CHANNEL_COLOR: Record<Channel, string> = { linea: SERIES[0], transferencia: SERIES[1], otros: SERIES[2] }
/** How a ticket stands: status colors (always beside a label and a count, never color alone). */
export const STAGE_COLOR: Record<OpenStage, string> = { nuevo: STATUS.critical, "en-proceso": STATUS.warning, visita: SERIES[0] }
export const MONTH_COLOR: Record<MonthState, string> = { abierto: STATUS.serious, resuelto: STATUS.good, descartado: INK.muted }

const H = 176
const GAP = 2

/** A stack of segments bottom-up with a 2 px surface gap between them; the top one gets the rounded end. */
function Stack({ x, w, y, parts, opacity, delay }: { x: number; w: number; y: (v: number) => number; parts: { key: string; v: number; color: string }[]; opacity: number; delay: number }) {
  const shown = parts.filter((p) => p.v > 0)
  // Where each segment starts: the sum of the ones under it.
  const base = shown.map((_, i) => shown.slice(0, i).reduce((a, q) => a + q.v, 0))
  return (
    <g opacity={opacity} style={{ transition: "opacity 200ms" }}>
      {shown.map((p, i) => {
        const y0 = y(base[i])
        const y1 = y(base[i] + p.v)
        const top = i === shown.length - 1
        const h = Math.max(1, y0 - y1 - (top ? 0 : GAP))
        const r = top ? Math.min(4, w / 2, h) : 0
        const yy = y1 + (top ? 0 : GAP)
        const d = `M${x},${yy + h}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + w - r}Q${x + w},${yy} ${x + w},${yy + r}V${yy + h}Z`
        return <path key={p.key} d={d} fill={p.color} className="t2-rise" style={{ animationDelay: `${delay}ms` }} />
      })}
    </g>
  )
}

/**
 * Payments per day for the last two weeks, stacked by channel (online, transfers, the rest), today brought forward
 * with its total. Hover a day for each channel's count and amount.
 */
export function PaymentDays({ days, today, label, channelLabel, dayTitle, money, countLabel, todayLabel }: { days: PayDay[]; today: string; label: string; channelLabel: (c: Channel) => string; dayTitle: (day: string) => string; money: (n: number) => string; countLabel: (n: number) => string; todayLabel: string }) {
  const [at, setAt] = useState<string | null>(null)
  return (
    <Frame height={H} label={label}>
      {(w, tip) => {
        const x = scaleBand<string>()
          .domain(days.map((d) => d.day))
          .range([2, w - 2])
          .paddingInner(0.28)
        // A floor of 4: one payment on a quiet day stays a short bar, not a full-height spike.
        const most = Math.max(4, ...days.map((d) => d.total.n))
        const y = scaleLinear()
          .domain([0, most])
          .range([H - 26, 24])
        const bw = x.bandwidth()
        return (
          <g>
            <line x1={0} x2={w} y1={H - 25.5} y2={H - 25.5} stroke={INK.axis} />
            {days.map((d, i) => {
              const isToday = d.day === today
              const x0 = x(d.day) ?? 0
              const date = new Date(`${d.day}T12:00:00`)
              const lit = at === null ? (isToday ? 1 : 0.55) : at === d.day ? 1 : 0.35
              return (
                <g
                  key={d.day}
                  onPointerMove={(e) => {
                    setAt(d.day)
                    tip.show(e, <TipBody title={dayTitle(d.day)} rows={[...CHANNELS.map((c) => ({ label: `${channelLabel(c)} · ${d.by[c].n}`, value: money(d.by[c].amount), color: CHANNEL_COLOR[c] })), { label: countLabel(d.total.n), value: money(d.total.amount) }]} />)
                  }}
                  onPointerLeave={() => {
                    setAt(null)
                    tip.hide()
                  }}
                >
                  <rect x={x0 - 2} y={0} width={bw + 4} height={H} fill="transparent" />
                  {isToday && <rect x={x0 - 4} y={14} width={bw + 8} height={H - 36} rx={8} fill="rgba(57,135,229,0.08)" stroke="rgba(57,135,229,0.3)" />}
                  <Stack x={x0} w={bw} y={y} parts={CHANNELS.map((c) => ({ key: c, v: d.by[c].n, color: CHANNEL_COLOR[c] }))} opacity={lit} delay={i * 25} />
                  {/* Every day's count over its bar (there is no axis); today's and the hovered one bright. */}
                  {d.total.n > 0 && (isToday || at === d.day || bw >= 14) && (
                    <text x={x0 + bw / 2} y={y(d.total.n) - 6} textAnchor="middle" fontSize={isToday || at === d.day ? 11 : 10} fontWeight={isToday || at === d.day ? 500 : 400} fill={isToday || at === d.day ? INK.primary : INK.muted} className="tabular-nums">
                      {d.total.n}
                    </text>
                  )}
                  {(bw >= 16 || i % 2 === days.length % 2 || isToday) && (
                    <text x={x0 + bw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill={isToday ? INK.primary : INK.muted} fontWeight={isToday ? 500 : 400}>
                      {isToday ? todayLabel : date.getDate()}
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

/** The open tickets as one bar split by stage, each with its label and count (HTML: reflows on any width). */
export function StageBar({ open, stageLabel }: { open: TicketFigures["open"]; stageLabel: (s: OpenStage) => string }) {
  const total = open.total
  return (
    <div className="grid gap-2">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/[0.06]">
        {total > 0 &&
          OPEN_STAGES.filter((s) => open[s] > 0).map((s) => (
            <div key={s} className="t2-grow h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(open[s] / total) * 100}%`, background: STAGE_COLOR[s] }} />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
        {OPEN_STAGES.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: STAGE_COLOR[s] }} />
            {stageLabel(s)} <span className="font-mono tabular-nums text-zinc-50">{open[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * This month's tickets per day they were opened, stacked by how each stands now (open on top: what still needs
 * someone), the days still to come as faint slots and today marked. Hover a day for its numbers.
 */
export function TicketDays({ days, today, label, stateLabel, dayTitle, countLabel, todayLabel }: { days: TicketFigures["days"]; today: string; label: string; stateLabel: (s: MonthState) => string; dayTitle: (day: string) => string; countLabel: (n: number) => string; todayLabel: string }) {
  const [at, setAt] = useState<string | null>(null)
  const order: MonthState[] = ["resuelto", "descartado", "abierto"]
  return (
    <Frame height={H - 36} label={label}>
      {(w, tip) => {
        const h = H - 36
        const x = scaleBand<string>()
          .domain(days.map((d) => d.day))
          .range([2, w - 2])
          .paddingInner(0.25)
        const total = (d: (typeof days)[number]) => MONTH_STATES.reduce((a, s) => a + d.by[s], 0)
        const most = Math.max(4, ...days.map(total))
        const y = scaleLinear()
          .domain([0, most])
          .range([h - 24, 18])
        const bw = x.bandwidth()
        return (
          <g>
            <line x1={0} x2={w} y1={h - 23.5} y2={h - 23.5} stroke={INK.axis} />
            {days.map((d, i) => {
              const x0 = x(d.day) ?? 0
              const n = total(d)
              const isToday = d.day === today
              const dayNum = Number(d.day.slice(8, 10))
              return (
                <g
                  key={d.day}
                  onPointerMove={(e) => {
                    if (d.future) return
                    setAt(d.day)
                    tip.show(e, <TipBody title={dayTitle(d.day)} rows={[...[...order].reverse().map((s) => ({ label: stateLabel(s), value: String(d.by[s]), color: MONTH_COLOR[s] })), { label: countLabel(n), value: "" }]} />)
                  }}
                  onPointerLeave={() => {
                    setAt(null)
                    tip.hide()
                  }}
                >
                  <rect x={x0 - 1} y={0} width={bw + 2} height={h} fill="transparent" />
                  {d.future ? (
                    <rect x={x0} y={h - 28} width={bw} height={4} rx={2} fill="rgba(255,255,255,0.05)" />
                  ) : (
                    <Stack x={x0} w={bw} y={y} parts={order.map((s) => ({ key: s, v: d.by[s], color: MONTH_COLOR[s] }))} opacity={at === null || at === d.day ? 1 : 0.4} delay={i * 18} />
                  )}
                  {isToday && <line x1={x0 + bw / 2} x2={x0 + bw / 2} y1={10} y2={h - 24} stroke={INK.secondary} strokeDasharray="2 3" />}
                  {n > 0 && (at === d.day || bw >= 9) && (
                    <text x={x0 + bw / 2} y={y(n) - 5} textAnchor="middle" fontSize={at === d.day ? 10.5 : 9.5} fill={at === d.day ? INK.primary : INK.muted} className="tabular-nums">
                      {n}
                    </text>
                  )}
                  {(isToday || dayNum === 1 || dayNum % 5 === 0) && !(dayNum % 5 === 0 && Math.abs(dayNum - Number(today.slice(8, 10))) < 3 && !isToday) && (
                    <text x={x0 + bw / 2} y={h - 8} textAnchor="middle" fontSize={10} fill={isToday ? INK.primary : INK.muted} fontWeight={isToday ? 500 : 400}>
                      {isToday ? todayLabel : dayNum}
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
