"use client"

import { useState } from "react"
import { scaleLinear, scaleTime } from "d3-scale"
import { area, curveBasis, line, stack as d3stack } from "d3-shape"
import { REPAIR_GROUPS, type RepairGroup } from "@/lib/interno/tablero2-more"
import type { FaultQuake as Quake, QuakeEvent, QuakeLane } from "@/lib/interno/tablero2-x"
import { INK } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { REPAIR_COLOR } from "./RepairGantt"
import { clipName } from "./format"

export type QuakeLabels = {
  all: string
  kinds: string
  kind: (k: RepairGroup) => string
  site: (name: string) => string
  pulse: string
  now: string
  rate: (n: string) => string
  reports: (n: number) => string
  trend: (x: number) => string
  event: (e: QuakeEvent) => string
  day: (t: number) => string
  repeat: (days: number) => string
}

const WIDE = 720

/** A report's tremor, `dx` px after its onset: a damped wave (`wave` px long, decaying over `decay` px), 0 outside. */
const tremor = (dx: number, wave: number, decay: number) => (dx < 0 || dx > decay * 4.5 ? 0 : Math.exp(-dx / decay) * Math.sin((2 * Math.PI * dx) / wave))
/** The resting trace: a faint, steady hum so an empty lane still reads as a live instrument. */
const hum = (x: number, lane: number) => 0.45 * Math.sin(x * 0.9 + lane * 1.7) + 0.3 * Math.sin(x * 2.3 + lane)

/** Seven-day centered average of one kind's daily reports (the pulse reads as a ridge, not as noise). */
const smooth = (xs: number[]) => xs.map((_, i) => {
  const win = xs.slice(Math.max(0, i - 3), i + 4)
  return win.reduce((a, b) => a + b, 0) / win.length
})

/**
 * What fails and where, as a seismograph: the network's pulse on top (reports per day by kind, seven-day average,
 * stacked), then one lane per deployment over the same 90 days. Every report is a capsule on its lane on the day it was
 * opened, stacked into that day's needle and colored by kind; open ones glow. Under the baseline, an arc joins a
 * client's report with its next one: the deeper the arc, the longer it held before failing again. On the right, the
 * lane's kind mix, reports per 10 active clients and the last 30 days vs before. The kind buttons above isolate one kind.
 */
export function FaultQuake({ q, label, labels }: { q: Quake; label: string; labels: QuakeLabels }) {
  const [only, setOnly] = useState<RepairGroup | null>(null)
  const [lane, setLane] = useState<string | null>(null)
  const laneH = (w: number) => (w >= WIDE ? 76 : 82)
  const top = (w: number) => (w >= WIDE ? 96 : 76)
  const height = (w: number) => top(w) + q.lanes.length * laneH(w) + 30
  const on = (k: RepairGroup) => only === null || only === k
  return (
    <div className="grid gap-3">
      <div role="group" aria-label={labels.kinds} className="flex flex-wrap gap-1.5">
        {[null, ...REPAIR_GROUPS].map((k) => {
          const n = k === null ? q.total : q.byKind[REPAIR_GROUPS.indexOf(k)]
          const pressed = only === k
          return (
            <button
              key={k ?? "all"}
              type="button"
              aria-pressed={pressed}
              onClick={() => setOnly(k)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${pressed ? "border-white/40 bg-white/10 text-zinc-50" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"}`}
            >
              {k && <span aria-hidden className="size-2 rounded-full" style={{ background: REPAIR_COLOR[k], boxShadow: pressed ? `0 0 8px ${REPAIR_COLOR[k]}` : undefined }} />}
              {k ? labels.kind(k) : labels.all}
              <span className="font-mono tabular-nums text-zinc-500">{n}</span>
            </button>
          )
        })}
      </div>
      <Frame height={height} label={label}>
        {(w, tip) => {
          const wide = w >= WIDE
          const LH = laneH(w)
          const TOP = top(w)
          const left = wide ? 156 : 4
          const right = wide ? 168 : 4
          const x = scaleTime().domain([new Date(q.from), new Date(q.now)]).range([left, w - right])
          const dayW = (x.range()[1] - x.range()[0]) / q.days
          const dayX = (d: number) => x.range()[0] + (d + 0.5) * dayW
          const capW = Math.max(2, Math.min(5, dayW - 1.5))
          // Lane geometry: label row on phones; above the baseline the tremor and the report markers on its crest,
          // the repeat arcs below it.
          const head = wide ? 0 : 18
          const base = (i: number) => TOP + i * LH + head + (LH - head) * 0.6
          const amp = wide ? 15 : 12
          const wave = wide ? 9 : 6
          const decay = wide ? 13 : 8
          const room = (LH - head) * 0.6 - 6 - amp - 4
          const capH = Math.max(2, Math.min(5, room / q.maxStack - 1.5))
          const sink = (LH - head) * 0.4 - 6
          const step = 1.25
          // The pulse: every kind's smoothed daily count, stacked; one kind alone when isolated.
          const pulseTop = 14
          const pulseBase = TOP - 22
          const series = REPAIR_GROUPS.map((_, k) => smooth(q.pulse.map((d) => d[k])))
          const rows = q.pulse.map((_, d) => Object.fromEntries(REPAIR_GROUPS.map((g, k) => [g, on(g) ? series[k][d] : 0])))
          const stacked = d3stack<Record<string, number>>().keys(REPAIR_GROUPS as unknown as string[])(rows)
          const peak = Math.max(0.5, ...stacked.flatMap((s) => s.map((p) => p[1])))
          const py = scaleLinear().domain([0, peak]).range([pulseBase, pulseTop])
          const band = area<[number, number]>().x((_, d) => dayX(d)).y0((p) => py(p[0])).y1((p) => py(p[1])).curve(curveBasis)
          const crest = line<[number, number]>().x((_, d) => dayX(d)).y((p) => py(p[1])).curve(curveBasis)
          const months = x.ticks(wide ? 6 : 3)
          const weeks = x.ticks(13)
          const bottom = TOP + q.lanes.length * LH
          const dayTip = (l: QuakeLane, d: number) => {
            const evs = l.events.filter((e) => e.day === d)
            return <TipBody title={`${labels.site(l.name)} · ${labels.day(evs[0].t)}`} rows={evs.slice(0, 6).flatMap((e) => {
              const again = l.repeats.find((r) => l.events[r.b].id === e.id)
              const row = { label: e.who || labels.kind(e.kind), value: labels.event(e), color: REPAIR_COLOR[e.kind] }
              return again ? [row, { label: "", value: labels.repeat(again.days) }] : [row]
            })} />
          }
          return (
            <g>
              <defs>
                {REPAIR_GROUPS.map((g) => (
                  <linearGradient key={g} id={`fq-${g}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={REPAIR_COLOR[g]} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={REPAIR_COLOR[g]} stopOpacity={0.12} />
                  </linearGradient>
                ))}
                <linearGradient id="fq-now" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0.07} />
                </linearGradient>
                <filter id="fq-glow" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="2.4" />
                </filter>
              </defs>
              {/* Time grid: faint weeks, the months labelled at the bottom. */}
              {weeks.map((t) => <line key={+t} x1={x(t)} x2={x(t)} y1={pulseTop - 6} y2={bottom} stroke={INK.grid} strokeOpacity={0.55} />)}
              {months.map((t) => (
                <g key={+t}>
                  <line x1={x(t)} x2={x(t)} y1={pulseTop - 6} y2={bottom + 4} stroke={INK.axis} />
                  <text x={x(t)} y={bottom + 18} textAnchor="middle" fontSize={10.5} fill={INK.muted}>{labels.day(+t)}</text>
                </g>
              ))}
              {/* The last 30 days, faintly lit, and the "now" edge. */}
              <rect x={x(q.now - 30 * 864e5)} y={pulseTop - 6} width={x(q.now) - x(q.now - 30 * 864e5)} height={bottom - pulseTop + 6} fill="url(#fq-now)" />
              <line x1={x(q.now)} x2={x(q.now)} y1={pulseTop - 8} y2={bottom + 4} stroke={INK.secondary} strokeOpacity={0.6} strokeDasharray="2 3" />
              <text x={x(q.now)} y={pulseTop - 10} textAnchor="end" fontSize={10} fill={INK.muted}>{labels.now}</text>

              {/* The pulse. */}
              <text x={wide ? left - 12 : left} y={wide ? (pulseTop + pulseBase) / 2 : pulseTop - 10} textAnchor={wide ? "end" : "start"} dy={wide ? "0.35em" : 0} fontSize={10.5} fill={INK.secondary}>{labels.pulse}</text>
              {stacked.map((s) => (
                <path key={s.key} d={band(s as unknown as [number, number][]) ?? ""} fill={`url(#fq-${s.key})`} className="t2-fade" />
              ))}
              {stacked.length > 0 && <path d={crest(stacked[stacked.length - 1] as unknown as [number, number][]) ?? ""} fill="none" stroke={INK.primary} strokeOpacity={0.55} strokeWidth={1.2} className="t2-draw" pathLength={1} />}
              <line x1={x.range()[0]} x2={x.range()[1]} y1={pulseBase} y2={pulseBase} stroke={INK.axis} />

              {q.lanes.map((l, i) => {
                const b = base(i)
                const y0 = TOP + i * LH
                const dim = lane !== null && lane !== l.id
                const days = [...new Set(l.events.map((e) => e.day))]
                const name = labels.site(l.name)
                // A day's tremor is as strong as its reports (one = 60 %, four or more = full) and wears the color of
                // its most common kind (among the isolated one, if any).
                const strength = (n: number) => amp * Math.min(1, 0.45 + 0.15 * n)
                const quakes = days.map((d) => {
                  const evs = l.events.filter((e) => e.day === d)
                  const pool = evs.some((e) => on(e.kind)) ? evs.filter((e) => on(e.kind)) : evs
                  const counts = REPAIR_GROUPS.map((g) => pool.filter((e) => e.kind === g).length)
                  const kind = REPAIR_GROUPS[counts.indexOf(Math.max(...counts))]
                  const a = strength(evs.length)
                  const x0 = dayX(d) - wave * 0.25
                  const pts: string[] = []
                  for (let px = x0; px <= Math.min(x.range()[1], x0 + decay * 4.5); px += step) pts.push(`${px.toFixed(1)},${(b - hum(px, i) - a * tremor(px - x0, wave, decay)).toFixed(1)}`)
                  return { day: d, kind, a, x0, lit: evs.some((e) => on(e.kind)), path: `M${pts.join("L")}` }
                })
                const peaks = new Map(quakes.map((d) => [d.day, d.a]))
                const tracePts: string[] = []
                for (let px = x.range()[0]; px <= x.range()[1]; px += step) tracePts.push(`${px.toFixed(1)},${(b - hum(px, i) - quakes.reduce((acc, d) => acc + d.a * tremor(px - d.x0, wave, decay), 0)).toFixed(1)}`)
                const trace = `M${tracePts.join("L")}`
                // Kind mix: segments as wide as each kind's share, 2px gaps, starts precomputed.
                const kinds = l.byKind.map((n, k) => ({ n, k })).filter((m) => m.n)
                const room = 112 - 2 * (kinds.length - 1)
                const widths = kinds.map((m) => Math.max(2, (m.n / l.total) * room))
                const mix = kinds.map((m, j) => ({ ...m, w: widths[j], x: w - right + 18 + widths.slice(0, j).reduce((a, c) => a + c + 2, 0) }))
                return (
                  <g key={l.id || "none"} opacity={dim ? 0.38 : 1} style={{ transition: "opacity 200ms" }} onPointerEnter={() => setLane(l.id)} onPointerLeave={() => setLane(null)}>
                    <rect x={2} y={y0 + 3} width={w - 4} height={LH - 6} rx={10} fill="#ffffff" fillOpacity={lane === l.id ? 0.045 : 0.018} />
                    {/* Name and figures: a column each side on wide screens, one row above the lane on phones. */}
                    {wide ? (
                      <>
                        <text x={left - 12} y={b - 6} textAnchor="end" fontSize={11.5} fill={INK.primary}>{clipName(name, 20)}</text>
                        <text x={left - 12} y={b + 9} textAnchor="end" fontSize={10} fill={INK.muted}>{labels.reports(l.total)}</text>
                      </>
                    ) : (
                      <>
                        <text x={left + 6} y={y0 + 16} fontSize={11} fill={INK.primary}>{clipName(name, Math.max(8, Math.floor((w - 150) / 6.2)))}</text>
                        <text x={w - 10} y={y0 + 16} textAnchor="end" fontSize={10} fill={INK.muted}>{[labels.reports(l.total), l.per10 !== null ? labels.rate(l.per10.toLocaleString("es-MX", { maximumFractionDigits: 1 })) : null].filter(Boolean).join(" · ")}</text>
                      </>
                    )}
                    {/* Repeats: an arc under the baseline from a client's report to its next one. */}
                    {l.repeats.map((r, j) => {
                      const a = dayX(l.events[r.a].day)
                      const c = dayX(l.events[r.b].day)
                      const depth = Math.min(sink - 2, 5 + (c - a) * 0.22)
                      const kind = l.events[r.b].kind
                      return (
                        <path
                          key={j}
                          d={`M${a},${b + 4} C${a},${b + 4 + depth * 1.33} ${c},${b + 4 + depth * 1.33} ${c},${b + 4}`}
                          fill="none"
                          stroke={on(kind) ? REPAIR_COLOR[kind] : INK.muted}
                          strokeOpacity={on(kind) ? (r.days <= 30 ? 0.85 : 0.4) : 0.12}
                          strokeWidth={r.days <= 30 ? 1.4 : 1}
                          strokeDasharray={r.days <= 30 ? undefined : "2 2.5"}
                          className="t2-draw"
                          pathLength={1}
                          style={{ animationDelay: `${300 + i * 60}ms` }}
                        />
                      )
                    })}
                    {/* The trace: the hum plus every day's tremor, then each day's tremor again in its kind's color, glowing. */}
                    <path d={trace} fill="none" stroke={INK.secondary} strokeOpacity={0.4} strokeWidth={1} strokeLinejoin="round" className="t2-draw" pathLength={1} style={{ animationDelay: `${i * 80}ms` }} />
                    {quakes.map((d) => (
                      <g key={d.day} opacity={d.lit ? 1 : 0.15}>
                        <path d={d.path} fill="none" stroke={REPAIR_COLOR[d.kind]} strokeWidth={3.2} strokeOpacity={0.55} filter="url(#fq-glow)" />
                        <path d={d.path} fill="none" stroke={REPAIR_COLOR[d.kind]} strokeWidth={1.5} strokeLinejoin="round" className="t2-draw" pathLength={1} style={{ animationDelay: `${Math.min(1400, 200 + d.day * 10 + i * 60)}ms` }} />
                      </g>
                    ))}
                    {/* The markers: one capsule per report, stacked over the day's crest. */}
                    {l.events.map((e) => {
                      const cx = dayX(e.day)
                      const yy = b - (peaks.get(e.day) ?? amp) - 4 - (e.stack + 1) * (capH + 1.5)
                      const lit = on(e.kind)
                      return (
                        <g key={e.id}>
                          {e.open && lit && (
                            <>
                              <rect x={cx - capW / 2 - 1.5} y={yy - 1.5} width={capW + 3} height={capH + 3} rx={(capW + 3) / 2} fill={REPAIR_COLOR[e.kind]} filter="url(#fq-glow)" />
                              <circle cx={cx} cy={yy + capH / 2} r={capW / 2 + 1} fill="none" stroke={REPAIR_COLOR[e.kind]} className="t2-ping" />
                            </>
                          )}
                          <rect
                            x={cx - capW / 2}
                            y={yy}
                            width={capW}
                            height={capH}
                            rx={Math.min(capW, capH) / 2}
                            fill={REPAIR_COLOR[e.kind]}
                            fillOpacity={lit ? 1 : 0.1}
                            stroke={e.open && lit ? INK.primary : "none"}
                            strokeWidth={0.8}
                            className="t2-fade"
                            style={{ animationDelay: `${Math.min(1600, 400 + e.day * 10 + i * 60)}ms` }}
                          />
                        </g>
                      )
                    })}
                    {/* Hit targets: a whole day of the lane, wider and taller than its needle. */}
                    {days.map((d) => (
                      <rect key={d} x={dayX(d) - Math.max(dayW, 8) / 2} y={y0 + head + 2} width={Math.max(dayW, 8)} height={LH - head - 4} fill="transparent" onPointerMove={(ev) => tip.show(ev, dayTip(l, d))} onPointerLeave={tip.hide} />
                    ))}
                    {wide && (
                      <g>
                        {mix.map((m) => <rect key={m.k} x={m.x} y={b - 16} width={m.w} height={5} rx={2} fill={REPAIR_COLOR[REPAIR_GROUPS[m.k]]} fillOpacity={on(REPAIR_GROUPS[m.k]) ? 1 : 0.15} />)}
                        <text x={w - right + 18} y={b} fontSize={10.5} fill={INK.secondary}>
                          {l.per10 !== null ? labels.rate(l.per10.toLocaleString("es-MX", { maximumFractionDigits: 1 })) : "—"}
                        </text>
                        {l.trend !== null && (
                          <text x={w - right + 18} y={b + 13} fontSize={10} fill={l.trend >= 1.25 ? INK.primary : INK.muted}>{labels.trend(l.trend)}</text>
                        )}
                      </g>
                    )}
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
