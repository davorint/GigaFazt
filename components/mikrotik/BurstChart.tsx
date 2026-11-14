"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useTranslations } from "next-intl"
import { burstEnabled, type Pattern, type QueueParams, type Sample, type SimResult } from "@/lib/mikrotik/burst"
import { rosRate } from "@/lib/mikrotik/routeros"
import { fmtData, fmtNum, fmtRate, fmtSec } from "@/lib/mikrotik/format"

/** Validated against the dark surface (dataviz validate_palette: band, chroma, CVD, contrast). */
const RATE = "#0aa5c2"
const AVG = "#8b5cf6"

type Props = {
  result: SimResult
  params: QueueParams
  pattern: Pattern
  lineCapMbps: number | null
  direction: string
}

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return f * mag
}

type StateKey = "bursting" | "allowed" | "limited" | "idle"
function stateOf(s: Sample): StateKey {
  if (s.demand === 0) return "idle"
  if (s.inBurst) return "bursting"
  return s.burstAllowed ? "allowed" : "limited"
}

export function BurstChart({ result, params, pattern, lineCapMbps, direction }: Props) {
  const t = useTranslations("mikrotik.chart")
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

  const { samples, stats } = result
  const dt = stats.stepS
  const xMax = stats.durationS
  const narrow = width < 640
  const H = narrow ? 260 : 340
  const M = { l: narrow ? 46 : 56, r: 12, t: 26, b: 30 }
  const iw = width - M.l - M.r
  const ih = H - M.t - M.b
  const enabled = burstEnabled(params)

  const refs = useMemo(() => {
    const list: { key: string; v: number; dash: string; color: string }[] = [
      { key: "maxLimit", v: params.maxLimit, dash: "", color: "rgb(244 244 245 / 0.55)" },
    ]
    if (enabled) {
      list.push({ key: "burstLimit", v: params.burstLimit, dash: "6 4", color: "rgb(244 244 245 / 0.45)" })
      list.push({ key: "burstThreshold", v: params.burstThreshold, dash: "3 3", color: AVG })
    }
    if (params.limitAt > 0) list.push({ key: "limitAt", v: params.limitAt, dash: "1 4", color: "rgb(244 244 245 / 0.4)" })
    if (lineCapMbps) list.push({ key: "lineCap", v: lineCapMbps, dash: "10 3 2 3", color: "rgb(244 244 245 / 0.4)" })
    return list
  }, [params, enabled, lineCapMbps])

  const ml = M.l
  const mt = M.t
  const geo = useMemo(() => {
    let top = 0
    for (const r of refs) top = Math.max(top, r.v)
    for (const s of samples) {
      top = Math.max(top, s.rate, s.avg)
      if (Number.isFinite(s.demand)) top = Math.max(top, s.demand)
    }
    const yStep = niceStep(top * 1.08 || 1, narrow ? 4 : 5)
    const yTop = Math.ceil((top * 1.08 || 1) / yStep) * yStep
    const x = (v: number) => ml + (v / xMax) * iw
    const y = (v: number) => mt + ih - (Math.min(v, yTop) / yTop) * ih

    let rate = ""
    samples.forEach((s, i) => {
      rate += i === 0 ? `M${x(s.t)},${y(s.rate)}` : `V${y(s.rate)}`
      rate += `H${x(s.t + dt)}`
    })
    const area = `${rate}V${y(0)}H${x(0)}Z`
    const avg = samples.map((s, i) => `${i ? "L" : "M"}${x(s.t)},${y(s.avg)}`).join("")

    let demand = ""
    if (pattern.demandMbps !== null) {
      samples.forEach((s, i) => {
        demand += i === 0 ? `M${x(s.t)},${y(s.demand)}` : `V${y(s.demand)}`
        demand += `H${x(s.t + dt)}`
      })
    }

    const bands: { x: number; w: number }[] = []
    let start: number | null = null
    samples.forEach((s, i) => {
      if (s.burstAllowed && start === null) start = s.t
      const last = i === samples.length - 1
      if (start !== null && (!s.burstAllowed || last)) {
        const end = s.burstAllowed ? s.t + dt : s.t
        bands.push({ x: x(start), w: x(end) - x(start) })
        start = null
      }
    })

    // Reference labels, top to bottom, at least 13 px apart.
    const sorted = [...refs].sort((a, b) => b.v - a.v)
    const labels: ((typeof refs)[number] & { ly: number })[] = []
    for (const r of sorted) {
      const prev = labels.length ? labels[labels.length - 1].ly : -Infinity
      labels.push({ ...r, ly: Math.max(y(r.v) - 5, prev + 13) })
    }

    const yTicks: number[] = []
    for (let v = 0; v <= yTop + 1e-9; v += yStep) yTicks.push(v)
    const xStep = niceStep(xMax, narrow ? 4 : 8)
    const xTicks: number[] = []
    // Leave room for the axis title at the right end.
    for (let v = 0; v <= xMax + 1e-9; v += xStep) if (narrow || x(v) < ml + iw - 56) xTicks.push(v)
    return { x, y, rate, area, avg, demand, bands, labels, yTicks, xTicks }
  }, [refs, samples, narrow, xMax, iw, ih, ml, mt, dt, pattern.demandMbps])

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const tt = ((e.clientX - r.left - M.l) / iw) * xMax
    if (tt < 0 || tt > xMax) return setHover(null)
    setKeyboard(false)
    setHover(Math.min(samples.length - 1, Math.max(0, Math.floor(tt / dt))))
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const n = samples.length
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

  const cell = (v: number) => (Number.isFinite(v) ? fmtRate(v) : t("saturating"))
  const h = hover !== null ? samples[hover] : null
  const tipLines = h
    ? [
        [t("tip.rate"), fmtRate(h.rate)],
        [t("tip.avg"), fmtRate(h.avg)],
        [t("tip.ceiling"), fmtRate(h.ceiling)],
        [t("tip.demand"), cell(h.demand)],
        [t("tip.state"), t(`tip.${stateOf(h)}`)],
      ]
    : []
  const hx = h ? geo.x(h.t + dt / 2) : 0
  const tipLeft = hx > width / 2

  return (
    <figure className="grid min-w-0 gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-300" aria-label={t("label", { direction })}>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-4 rounded-[3px]" style={{ background: `${RATE}55`, boxShadow: `inset 0 2px 0 ${RATE}` }} />
          {t("legend.rate")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: AVG }} />
          {t("legend.avg")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-4 rounded-[3px] border border-white/10" style={{ background: `${RATE}1f` }} />
          {t("legend.allowed")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="w-4 border-t-2 border-dotted border-zinc-400" />
          {pattern.demandMbps === null ? t("legend.demandSaturating") : t("legend.demand")}
        </li>
      </ul>

      <div ref={wrap} className="relative w-full min-w-0 select-none">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={t("label", { direction })}
          aria-describedby={`${id}-sum`}
          onPointerMove={pick}
          onPointerLeave={() => !keyboard && setHover(null)}
          onKeyDown={onKey}
          onBlur={() => keyboard && setHover(null)}
          className="block w-full touch-pan-y rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* grid */}
          {geo.yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={M.l + iw} y1={geo.y(v)} y2={geo.y(v)} stroke="rgb(255 255 255 / 0.06)" />
              <text x={M.l - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" className="fill-zinc-500 font-mono text-[10px] tabular-nums">
                {fmtNum(v, 1)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((v) => (
            <text key={`x${v}`} x={geo.x(v)} y={H - 10} textAnchor="middle" className="fill-zinc-500 font-mono text-[10px] tabular-nums">
              {fmtNum(v, 1)}
            </text>
          ))}
          <text x={M.l - 8} y={M.t - 14} textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">
            {t("axisY")}
          </text>
          {!narrow && (
            <text x={M.l + iw} y={H - 10} textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">
              {t("axisX")}
            </text>
          )}

          {/* burst allowed */}
          {geo.bands.map((b, i) => (
            <rect key={i} x={b.x} y={M.t} width={b.w} height={ih} fill={RATE} fillOpacity={0.07} />
          ))}

          {/* delivered */}
          <path d={geo.area} fill={RATE} fillOpacity={0.22} />
          <path d={geo.rate} fill="none" stroke={RATE} strokeWidth={2} strokeLinejoin="round" />

          {/* demand */}
          {geo.demand && (
            <path d={geo.demand} fill="none" stroke="rgb(161 161 170 / 0.8)" strokeWidth={1.5} strokeDasharray="2 3" />
          )}

          {/* references */}
          {geo.labels.map((r) => (
            <g key={r.key}>
              <line
                x1={M.l}
                x2={M.l + iw}
                y1={geo.y(r.v)}
                y2={geo.y(r.v)}
                stroke={r.color}
                strokeWidth={1}
                strokeDasharray={r.dash || undefined}
              />
              <text
                x={M.l + iw - 4}
                y={r.ly}
                textAnchor="end"
                className="fill-zinc-200 font-mono text-[10px]"
                stroke="#09090b"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {t(`ref.${r.key}`)} {rosRate(r.v)}
              </text>
            </g>
          ))}

          {/* average */}
          <path d={geo.avg} fill="none" stroke={AVG} strokeWidth={2} strokeLinejoin="round" />

          {/* crosshair */}
          {h && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={M.t} y2={M.t + ih} stroke="rgb(255 255 255 / 0.35)" />
              <circle cx={hx} cy={geo.y(h.rate)} r={4.5} fill={RATE} stroke="#09090b" strokeWidth={2} />
              <circle cx={geo.x(h.t)} cy={geo.y(h.avg)} r={4.5} fill={AVG} stroke="#09090b" strokeWidth={2} />
            </g>
          )}
        </svg>

        {h && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl"
            style={tipLeft ? { right: width - hx + 10 } : { left: hx + 10 }}
          >
            <p className="mb-1 font-mono text-zinc-400">{t("tip.t", { value: `${fmtSec(h.t)} – ${fmtSec(h.t + dt)}` })}</p>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              {tipLines.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-400">{k}</dt>
                  <dd className="text-right font-mono tabular-nums text-zinc-100">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {keyboard && h ? `${t("tip.t", { value: fmtSec(h.t) })}. ${tipLines.map(([k, v]) => `${k}: ${v}`).join(". ")}` : ""}
        </p>
      </div>

      <p id={`${id}-sum`} className="sr-only">
        {t("summary", {
          duration: fmtSec(stats.durationS),
          total: fmtData(stats.totalMb),
          first: fmtSec(stats.firstBurstS),
          burst: fmtSec(stats.burstS),
        })}
      </p>

      <details className="group text-sm" onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-zinc-400 hover:text-foreground">{t("table")}</summary>
        {tableOpen && (
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label={t("table")}>
            <table className="w-full text-left font-mono text-xs tabular-nums">
              <caption className="sr-only">{t("tableCaption", { step: fmtSec(dt) })}</caption>
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
                <tr>
                  {(["t", "demand", "avg", "ceiling", "rate", "state"] as const).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-normal">
                      {t(`col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => (
                  <tr key={s.t} className="border-t border-white/5">
                    <td className="px-3 py-1.5">{fmtNum(s.t, 2)}</td>
                    <td className="px-3 py-1.5">{cell(s.demand)}</td>
                    <td className="px-3 py-1.5">{fmtRate(s.avg)}</td>
                    <td className="px-3 py-1.5">{fmtRate(s.ceiling)}</td>
                    <td className="px-3 py-1.5 text-zinc-100">{fmtRate(s.rate)}</td>
                    <td className="px-3 py-1.5 font-sans text-zinc-400">{t(`tip.${stateOf(s)}`)}</td>
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
