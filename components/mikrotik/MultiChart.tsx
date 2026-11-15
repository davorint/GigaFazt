"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { fmtNum, fmtRate, fmtSec } from "@/lib/mikrotik/format"
import { niceStep } from "./ticks"

export type ChartSeries = {
  key: string
  label: string
  color: string
  /** One value per step, Mbps. */
  values: number[]
  /** Dashed line (line mode), e.g. "your configuration". */
  dash?: string
}

export type ChartRef = { key: string; label: string; v: number; dash: string; color: string }

type Props = {
  /** Accessible name of the chart. */
  label: string
  /** Text equivalent read after the name. */
  summary: string
  axisY: string
  axisX: string
  dt: number
  durationS: number
  series: ChartSeries[]
  /** "line": one step line per series; "stack": stacked areas (parts of a whole). */
  mode: "line" | "stack"
  refs?: ChartRef[]
  /** Steps to shade (e.g. the parent is full), with its legend label. */
  shade?: boolean[]
  shadeLabel?: string
  totalLabel?: string
  /** "t = {value}" */
  timeLabel: (range: string) => string
  /** Extra word after a series value in the tooltip (e.g. "en ráfaga"). */
  note?: (series: number, step: number) => string | null
  tableLabel: string
  tableCaption: string
  timeCol: string
}

const SURFACE = "#09090b"

/** Multi-series rate chart: legend, direct labels, crosshair tooltip, arrow keys, table. */
export function MultiChart(props: Props) {
  const { label, summary, axisY, axisX, dt, durationS, series, mode, refs = [], shade, shadeLabel, totalLabel, timeLabel, note } = props
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = series[0]?.values.length ?? 0
  const narrow = width < 640
  const H = narrow ? 280 : 360
  const ml = narrow ? 46 : 56
  const mt = 26
  const mr = 12
  const mb = 30
  const iw = width - ml - mr
  const ih = H - mt - mb
  const xMax = durationS
  const stack = mode === "stack"

  const totals = useMemo(() => {
    const out = new Array<number>(n).fill(0)
    for (const s of series) for (let i = 0; i < n; i++) out[i] += s.values[i]
    return out
  }, [series, n])

  const geo = useMemo(() => {
    let top = 0
    for (const r of refs) top = Math.max(top, r.v)
    if (stack) for (const v of totals) top = Math.max(top, v)
    else for (const s of series) for (const v of s.values) top = Math.max(top, v)
    const yStep = niceStep(top * 1.08 || 1, narrow ? 4 : 5)
    const yTop = Math.ceil((top * 1.08 || 1) / yStep) * yStep
    const x = (v: number) => ml + (v / xMax) * iw
    const y = (v: number) => mt + ih - (Math.min(Math.max(v, 0), yTop) / yTop) * ih

    const lower = new Array<number>(n).fill(0)
    const shapes = series.map((s) => {
      if (!stack) {
        let d = ""
        s.values.forEach((v, i) => {
          d += i === 0 ? `M${x(0)},${y(v)}` : `V${y(v)}`
          d += `H${x((i + 1) * dt)}`
        })
        return { line: d, area: "", top: s.values, thick: null as number[] | null }
      }
      const upper = s.values.map((v, i) => lower[i] + v)
      let edge = ""
      upper.forEach((v, i) => {
        edge += i === 0 ? `M${x(0)},${y(v)}` : `V${y(v)}`
        edge += `H${x((i + 1) * dt)}`
      })
      let back = ""
      for (let i = n - 1; i >= 0; i--) back += `V${y(lower[i])}H${x(i * dt)}`
      const area = `${edge}${back}Z`
      const mid = upper.map((v, i) => (v + lower[i]) / 2)
      const thick = upper.map((v, i) => y(lower[i]) - y(v))
      for (let i = 0; i < n; i++) lower[i] = upper[i]
      return { line: edge, area, top: mid, thick: thick as number[] | null }
    })

    // Right-edge labels (references and series), top to bottom, ≥ 13 px apart.
    type Lab = { key: string; text: string; y: number; color: string | null }
    const raw: Lab[] = refs.map((r) => ({ key: `r-${r.key}`, text: r.label, y: y(r.v) - 5, color: null }))
    series.forEach((s, k) => {
      const last = n - 1
      if (last < 0) return
      const shape = shapes[k]
      if (stack && (shape.thick?.[last] ?? 0) < 14) return
      raw.push({ key: `s-${s.key}`, text: s.label, y: y(shape.top[last]) + (stack ? 0 : -5), color: s.color })
    })
    raw.sort((a, b) => a.y - b.y)
    const labels: Lab[] = []
    for (const l of raw) {
      const prev = labels.length ? labels[labels.length - 1].y : -Infinity
      labels.push({ ...l, y: Math.min(mt + ih - 4, Math.max(l.y, prev + 13, mt + 8)) })
    }

    const bands: { x: number; w: number }[] = []
    if (shade) {
      let start: number | null = null
      for (let i = 0; i <= n; i++) {
        const on = i < n && shade[i]
        if (on && start === null) start = i
        if (!on && start !== null) {
          bands.push({ x: x(start * dt), w: x(i * dt) - x(start * dt) })
          start = null
        }
      }
    }

    const yTicks: number[] = []
    for (let v = 0; v <= yTop + 1e-9; v += yStep) yTicks.push(v)
    const xStep = niceStep(xMax, narrow ? 4 : 8)
    const xTicks: number[] = []
    for (let v = 0; v <= xMax + 1e-9; v += xStep) if (narrow || x(v) < ml + iw - 56) xTicks.push(v)
    return { x, y, shapes, labels, bands, yTicks, xTicks }
  }, [series, totals, refs, shade, stack, narrow, n, dt, xMax, iw, ih, ml])

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const tt = ((e.clientX - r.left - ml) / iw) * xMax
    if (tt < 0 || tt > xMax) return setHover(null)
    setKeyboard(false)
    setHover(Math.min(n - 1, Math.max(0, Math.floor(tt / dt))))
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const jump = e.shiftKey ? 10 : 1
    let next: number | null = null
    if (e.key === "ArrowRight") next = Math.min(n - 1, (hover ?? -1) + jump)
    else if (e.key === "ArrowLeft") next = Math.max(0, (hover ?? n) - jump)
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    else if (e.key === "Escape") return setHover(null)
    if (next === null) return
    e.preventDefault()
    setKeyboard(true)
    setHover(next)
  }

  const h = hover
  const rows =
    h === null
      ? []
      : series.map((s, k) => {
          const extra = note?.(k, h)
          return { key: s.key, color: s.color, label: s.label, value: fmtRate(s.values[h]), extra }
        })
  const hx = h === null ? 0 : geo.x((h + 0.5) * dt)
  const tipLeft = hx > width / 2
  const range = h === null ? "" : `${fmtSec(h * dt)} – ${fmtSec((h + 1) * dt)}`
  const spoken =
    h === null
      ? ""
      : `${timeLabel(fmtSec(h * dt))}. ${rows.map((r) => `${r.label}: ${r.value}${r.extra ? `, ${r.extra}` : ""}`).join(". ")}${
          stack && totalLabel ? `. ${totalLabel}: ${fmtRate(totals[h])}` : ""
        }${shade?.[h] && shadeLabel ? `. ${shadeLabel}` : ""}`

  return (
    <figure className="grid min-w-0 gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-300" aria-label={label}>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            {stack ? (
              <span aria-hidden className="h-3 w-4 rounded-[3px]" style={{ background: s.color }} />
            ) : (
              <span aria-hidden className="w-4 border-t-2" style={{ borderColor: s.color, borderStyle: s.dash ? "dashed" : "solid" }} />
            )}
            {s.label}
          </li>
        ))}
        {shade && shadeLabel && shade.some(Boolean) && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-4 rounded-[3px] border border-white/15 bg-white/[0.08]" />
            {shadeLabel}
          </li>
        )}
      </ul>

      <div ref={wrap} className="relative w-full min-w-0 select-none">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={label}
          aria-describedby={`${id}-sum`}
          onPointerMove={pick}
          onPointerLeave={() => !keyboard && setHover(null)}
          onKeyDown={onKey}
          onBlur={() => keyboard && setHover(null)}
          className="block w-full touch-pan-y rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {geo.bands.map((b, i) => (
            <rect key={i} x={b.x} y={mt} width={b.w} height={ih} fill="#ffffff" fillOpacity={0.06} />
          ))}
          {geo.yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={ml} x2={ml + iw} y1={geo.y(v)} y2={geo.y(v)} stroke="rgb(255 255 255 / 0.06)" />
              <text x={ml - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" className="fill-zinc-500 font-mono text-[10px] tabular-nums">
                {fmtNum(v, 1)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((v) => (
            <text key={`x${v}`} x={geo.x(v)} y={H - 10} textAnchor="middle" className="fill-zinc-500 font-mono text-[10px] tabular-nums">
              {fmtNum(v, 1)}
            </text>
          ))}
          <text x={ml - 8} y={mt - 14} textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">
            {axisY}
          </text>
          {!narrow && (
            <text x={ml + iw} y={H - 10} textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">
              {axisX}
            </text>
          )}

          {series.map((s, k) =>
            stack ? (
              <g key={s.key}>
                <path d={geo.shapes[k].area} fill={s.color} fillOpacity={0.82} />
                {/* 2 px surface gap between stacked bands. */}
                <path d={geo.shapes[k].line} fill="none" stroke={SURFACE} strokeWidth={2} />
              </g>
            ) : (
              <path
                key={s.key}
                d={geo.shapes[k].line}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                strokeLinejoin="round"
              />
            )
          )}

          {refs.map((r) => (
            <line
              key={r.key}
              x1={ml}
              x2={ml + iw}
              y1={geo.y(r.v)}
              y2={geo.y(r.v)}
              stroke={r.color}
              strokeWidth={1}
              strokeDasharray={r.dash || undefined}
            />
          ))}
          {geo.labels.map((l) => (
            <g key={l.key}>
              {l.color && <circle cx={ml + iw - 8} cy={l.y - 3.5} r={4} fill={l.color} stroke={SURFACE} strokeWidth={2} />}
              <text
                x={ml + iw - (l.color ? 16 : 4)}
                y={l.y}
                textAnchor="end"
                className="fill-zinc-100 font-mono text-[10px]"
                stroke={SURFACE}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {l.text}
              </text>
            </g>
          ))}

          {h !== null && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={mt} y2={mt + ih} stroke="rgb(255 255 255 / 0.35)" />
              {!stack &&
                series.map((s) => (
                  <circle key={s.key} cx={hx} cy={geo.y(s.values[h])} r={4.5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                ))}
            </g>
          )}
        </svg>

        {h !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-2 z-10 min-w-48 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl"
            style={tipLeft ? { right: width - hx + 10 } : { left: hx + 10 }}
          >
            <p className="mb-1 font-mono text-zinc-400">{timeLabel(range)}</p>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              {[...rows].reverse().map((r) => (
                <div key={r.key} className="contents">
                  <dt className="flex items-center gap-1.5 text-zinc-300">
                    <span className="size-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </dt>
                  <dd className="text-right font-mono tabular-nums text-zinc-100">
                    {r.value}
                    {r.extra && <span className="ml-1.5 font-sans text-zinc-400">{r.extra}</span>}
                  </dd>
                </div>
              ))}
              {stack && totalLabel && (
                <div className="contents">
                  <dt className="border-t border-white/10 pt-1 text-zinc-400">{totalLabel}</dt>
                  <dd className="border-t border-white/10 pt-1 text-right font-mono tabular-nums text-zinc-100">{fmtRate(totals[h])}</dd>
                </div>
              )}
            </dl>
            {shade?.[h] && shadeLabel && <p className="mt-1 text-amber-300">{shadeLabel}</p>}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {keyboard ? spoken : ""}
        </p>
      </div>

      <p id={`${id}-sum`} className="sr-only">
        {summary}
      </p>

      <details className="group text-sm" onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-zinc-400 hover:text-foreground">{props.tableLabel}</summary>
        {tableOpen && (
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label={props.tableLabel}>
            <table className="w-full text-left font-mono text-xs tabular-nums">
              <caption className="sr-only">{props.tableCaption}</caption>
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
                <tr>
                  <th scope="col" className="px-3 py-2 font-normal">
                    {props.timeCol}
                  </th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="px-3 py-2 font-normal whitespace-nowrap">
                      {s.label}
                    </th>
                  ))}
                  {stack && totalLabel && (
                    <th scope="col" className="px-3 py-2 font-normal">
                      {totalLabel}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: n }, (_, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-1.5">{fmtNum(i * dt, 2)}</td>
                    {series.map((s, k) => {
                      const extra = note?.(k, i)
                      return (
                        <td key={s.key} className="px-3 py-1.5 whitespace-nowrap text-zinc-100">
                          {fmtRate(s.values[i])}
                          {extra && <span className="ml-1.5 font-sans text-zinc-500">{extra}</span>}
                        </td>
                      )
                    })}
                    {stack && totalLabel && <td className="px-3 py-1.5 text-zinc-100">{fmtRate(totals[i])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </figure>
  )
}
