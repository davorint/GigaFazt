"use client"

import { useId, useRef, useState } from "react"

/** Series colors: the dataviz reference dark pair (blue / orange), validated on the page's #030712 surface. */
const DOWN = "#3987e5"
const UP = "#d95926"
const W = 800
const H = 240
const PAD = { l: 44, r: 8, t: 10, b: 24 }

export type TrafficPoint = { t: string; down: number; up: number }

const mbps = (bytes: number, seconds: number) => (bytes * 8) / seconds / 1e6
const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2))

/**
 * Download and upload as average Mbps per bucket (5 minutes or 1 hour): two thin lines, one axis, a crosshair tooltip
 * on hover/focus, a legend. The page puts a table next to it (the text equivalent).
 */
export function TrafficChart({ points, seconds, label, downLabel, upLabel, unit }: { points: TrafficPoint[]; seconds: number; label: string; downLabel: string; upLabel: string; unit: string }) {
  const id = useId()
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const down = points.map((p) => mbps(p.down, seconds))
  const up = points.map((p) => mbps(p.up, seconds))
  const max = Math.max(1, ...down, ...up)
  const n = points.length
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")
  const when = (t: string) => new Date(t).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || n === 0) return
    const fx = ((clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))))
  }
  const h = hover !== null ? points[hover] : null
  return (
    <figure className="grid gap-2">
      <div className="flex flex-wrap gap-4 text-xs text-zinc-300" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: DOWN }} /> {downLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: UP }} /> {upLabel}
        </span>
        <span className="text-zinc-400">{unit}</span>
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-t`}
          className="h-60 w-full touch-none"
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
          <path d={path(down)} fill="none" stroke={DOWN} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={path(up)} fill="none" stroke={UP} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#ffffff" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
              <circle cx={x(hover)} cy={y(down[hover])} r={4} fill={DOWN} stroke="#030712" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <circle cx={x(hover)} cy={y(up[hover])} r={4} fill={UP} stroke="#030712" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {n > 0 && (
            <>
              <text x={PAD.l} y={H - 6} fontSize="11" fill="#a1a1aa">
                {when(points[0].t)}
              </text>
              <text x={W - PAD.r} y={H - 6} fontSize="11" fill="#a1a1aa" textAnchor="end">
                {when(points[n - 1].t)}
              </text>
            </>
          )}
        </svg>
        {h && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded-lg border border-white/15 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-100 shadow"
            style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}
          >
            <p className="text-zinc-400">{when(h.t)}</p>
            <p>
              {downLabel}: <span className="font-mono">{fmt(down[hover])} Mbps</span>
            </p>
            <p>
              {upLabel}: <span className="font-mono">{fmt(up[hover])} Mbps</span>
            </p>
          </div>
        )}
      </div>
    </figure>
  )
}
