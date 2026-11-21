"use client"

import { useId, useRef, useState } from "react"

/** Dark categorical slots of the dataviz reference palette, in their validated order (lines = adjacent pairs). */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const
const W = 800
const H = 200
const PAD = { l: 44, r: 8, t: 10, b: 24 }

export type Series = { label: string; color: string; values: (number | null)[] }

/**
 * Thin lines over time on one axis (gaps where a value is missing), a crosshair tooltip on hover, and a legend when
 * there's more than one series (one series: the title names it). The page puts a table next to it.
 */
export function LineChart({ times, series, label, unit, fmt }: { times: string[]; series: Series[]; label: string; unit: string; fmt: (n: number) => string }) {
  const id = useId()
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const max = Math.max(1, ...all)
  const n = times.length
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const path = (vs: (number | null)[]) => {
    let d = ""
    let pen = false
    vs.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const when = (t: string) => new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || n === 0) return
    const fx = ((clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))))
  }
  return (
    <figure className="grid gap-2">
      <div className="flex flex-wrap gap-4 text-xs text-zinc-300" aria-hidden>
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        <span className="text-zinc-400">{unit}</span>
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-t`}
          className="h-48 w-full touch-none"
          preserveAspectRatio="none"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          <title id={`${id}-t`}>{label}</title>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="#ffffff" strokeOpacity={f === 0 ? 0.25 : 0.08} vectorEffect="non-scaling-stroke" />
              <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#a1a1aa">
                {fmt(max * f)}
              </text>
            </g>
          ))}
          {series.map((s) => (
            <g key={s.label}>
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {/* A reading with no neighbor draws no line: a dot shows it. */}
              {s.values.map((v, i) =>
                v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} vectorEffect="non-scaling-stroke" /> : null
              )}
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#ffffff" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
              {series.map((s) =>
                s.values[hover] !== null && s.values[hover] !== undefined ? (
                  <circle key={s.label} cx={x(hover)} cy={y(s.values[hover] as number)} r={4} fill={s.color} stroke="#030712" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ) : null
              )}
            </g>
          )}
          {n > 0 && (
            <>
              <text x={PAD.l} y={H - 6} fontSize="11" fill="#a1a1aa">
                {when(times[0])}
              </text>
              <text x={W - PAD.r} y={H - 6} fontSize="11" fill="#a1a1aa" textAnchor="end">
                {when(times[n - 1])}
              </text>
            </>
          )}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded-lg border border-white/15 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-100 shadow"
            style={{ left: `${Math.min(65, (x(hover) / W) * 100)}%` }}
          >
            <p className="text-zinc-400">{when(times[hover])}</p>
            {series.map((s) => (
              <p key={s.label}>
                {s.label}: <span className="font-mono">{s.values[hover] === null || s.values[hover] === undefined ? "—" : `${fmt(s.values[hover] as number)} ${unit}`}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
