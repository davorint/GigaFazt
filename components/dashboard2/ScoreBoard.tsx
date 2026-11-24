"use client"

import { useState } from "react"
import { BETTER_HIGH, MEASURES, type Measure, type ScoreBoard as Board, type ScoreRow } from "@/lib/interno/tablero2-x"
import { INK, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { clipName } from "./format"

/** Better than the median / worse than it: a diverging pair (blue / orange, validated on the dark card, colorblind-safe), never red/green. */
export const SCORE_COLOR = { better: SERIES[0], worse: SERIES[1] } as const

const HEAD = 64
const ROW = 58
/** Below 900 px (phones, tablets: eight columns would crowd) each deployment is a card: a header, then one line per measure. */
const CARD_HEAD = 50
const LINE = 28
const CARD = CARD_HEAD + MEASURES.length * LINE + 12
const CARD_GAP = 18
const narrowAt = (w: number) => w < 900

/** A bar from the median line to its tip, rounded only at the tip (it grows out of the line). */
function bar(cx: number, y: number, len: number, h: number): string {
  const x1 = cx + len
  const r = Math.min(h / 2, Math.abs(len))
  if (len >= 0) return `M${cx},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${cx}Z`
  return `M${cx},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${cx}Z`
}

/** The score ring: measures better than the median sweep clockwise from the top, worse ones counter-clockwise. */
function Ring({ cx, cy, r, row, measured }: { cx: number; cy: number; r: number; row: ScoreRow; measured: number }) {
  const C = 2 * Math.PI * r
  const win = measured ? row.wins / measured : 0
  const loss = measured ? row.losses / measured : 0
  const text = row.score > 0 ? `+${row.score}` : row.score < 0 ? `−${Math.abs(row.score)}` : "0"
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK.grid} strokeWidth={4} />
      {win > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={SCORE_COLOR.better} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${Math.max(0.01, win * C - 3)} ${C}`} transform={`rotate(-90 ${cx} ${cy})`} className="t2-fade" />}
      {loss > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={SCORE_COLOR.worse} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${Math.max(0.01, loss * C - 3)} ${C}`} transform={`translate(${2 * cx} 0) scale(-1 1) rotate(-90 ${cx} ${cy})`} className="t2-fade" />}
      <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={r > 16 ? 13 : 11.5} fontWeight={500} fill={INK.primary} className="tabular-nums">
        {text}
      </text>
    </g>
  )
}

/**
 * The deployments against the network median (owner, 2026-11-24, replacing the parallel coordinates): one row per
 * deployment, one column per measure, and in each cell a bar out of the median line — right and blue when it beats
 * the median, left and orange when it trails (less latency, use and faults counts as better). Each measure is scaled to
 * its widest gap; the real value sits under every bar. A ring per deployment sweeps its wins and losses around its
 * score, and the rows run best to worst. Hover a cell for its place and its distance to the median; on a phone each
 * deployment becomes a card with the eight measures stacked.
 */
export function ScoreBoard({
  board,
  label,
  axisLabel,
  hint,
  medianText,
  fmt,
  summary,
  tipFor,
}: {
  board: Board
  label: string
  axisLabel: (m: Measure) => string
  hint: (m: Measure) => string
  medianText: (m: Measure, v: number) => string
  fmt: (m: Measure, v: number) => string
  summary: (r: ScoreRow) => string
  tipFor: (r: ScoreRow, m: Measure) => { title: string; rows: { label: string; value: string; color?: string }[] }
}) {
  const [hover, setHover] = useState<{ row: number; m: Measure | null } | null>(null)
  const n = board.rows.length
  return (
    <Frame height={(w) => (narrowAt(w) ? n * (CARD + CARD_GAP) : HEAD + n * ROW + 6)} label={label}>
      {(w, tip) => {
        const narrow = narrowAt(w)
        const measuredOf = (r: ScoreRow) => MEASURES.filter((m) => r.cells[m].value !== null).length
        const cell = (r: ScoreRow, ri: number, m: Measure, cx: number, y: number, half: number, h: number) => {
          const c = r.cells[m]
          const len = c.norm * half
          const color = c.dev > 0 ? SCORE_COLOR.better : SCORE_COLOR.worse
          const lit = !hover || hover.row === ri || hover.m === m
          return (
            <g key={m} opacity={lit ? 1 : 0.35} style={{ transition: "opacity 200ms" }}>
              {/* The track: the whole range of the measure, so a bar's length reads against it. */}
              <rect x={cx - half} y={y} width={half * 2} height={h} rx={h / 2} fill="rgba(255,255,255,0.035)" />
              {c.value !== null && c.dev !== 0 && (
                <>
                  <path d={bar(cx, y, len, h)} fill={`url(#t2-sb-${c.dev > 0 ? "up" : "down"})`} className="t2-grow" style={{ transformOrigin: c.dev > 0 ? "0% 50%" : "100% 50%", animationDelay: `${ri * 70 + MEASURES.indexOf(m) * 30}ms` }} />
                  <circle cx={cx + len} cy={y + h / 2} r={h * 0.42} fill={color} opacity={0.55} filter="url(#t2-sb-glow)" className="t2-fade" style={{ animationDelay: `${ri * 70 + MEASURES.indexOf(m) * 30 + 300}ms` }} />
                </>
              )}
              {c.value !== null && c.dev === 0 && <rect x={cx - 3} y={y + h / 2 - 3} width={6} height={6} rx={1} transform={`rotate(45 ${cx} ${y + h / 2})`} fill={INK.secondary} />}
            </g>
          )
        }
        const hit = (ri: number, m: Measure | null, x: number, y: number, wd: number, ht: number, r: ScoreRow) => (
          <rect
            key={`hit-${m ?? "row"}`}
            x={x}
            y={y}
            width={wd}
            height={ht}
            fill="transparent"
            onPointerMove={(e) => {
              setHover({ row: ri, m })
              if (m) {
                const t = tipFor(r, m)
                tip.show(e, <TipBody title={t.title} rows={t.rows} />)
              } else tip.show(e, <TipBody title={r.name} rows={[{ label: summary(r), value: "" }]} />)
            }}
            onPointerLeave={() => {
              setHover(null)
              tip.hide()
            }}
          />
        )
        const defs = (
          <defs>
            <linearGradient id="t2-sb-up" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={SCORE_COLOR.better} stopOpacity={0.4} />
              <stop offset="100%" stopColor={SCORE_COLOR.better} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="t2-sb-down" x1="1" x2="0" y1="0" y2="0">
              <stop offset="0%" stopColor={SCORE_COLOR.worse} stopOpacity={0.4} />
              <stop offset="100%" stopColor={SCORE_COLOR.worse} stopOpacity={1} />
            </linearGradient>
            <filter id="t2-sb-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
        )

        if (narrow) {
          // Phone: a card per deployment, the measures stacked (label · bar out of the median · value).
          const LAB = Math.min(96, w * 0.26)
          const VAL = 70
          const cx = LAB + (w - LAB - VAL) / 2
          const half = (w - LAB - VAL) / 2 - 8
          return (
            <g>
              {defs}
              {board.rows.map((r, ri) => {
                const top = ri * (CARD + CARD_GAP)
                const y0 = top + CARD_HEAD
                return (
                  <g key={r.id}>
                    <rect x={0} y={top} width={w} height={CARD} rx={12} fill={hover?.row === ri ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.02)"} stroke="rgba(255,255,255,0.06)" style={{ transition: "fill 200ms" }} />
                    <Ring cx={26} cy={top + 25} r={15} row={r} measured={measuredOf(r)} />
                    <text x={52} y={top + 21} fontSize={13} fontWeight={500} fill={INK.primary}>
                      <tspan fill={INK.muted} className="font-mono" fontSize={10.5}>
                        {String(ri + 1).padStart(2, "0")}
                      </tspan>
                      {"  "}
                      {clipName(r.name, Math.floor((w - 70) / 7.4))}
                    </text>
                    <text x={52} y={top + 37} fontSize={10.5} fill={INK.muted}>
                      {summary(r)}
                    </text>
                    <line x1={cx} x2={cx} y1={y0 - 4} y2={y0 + MEASURES.length * LINE - 6} stroke={INK.axis} strokeDasharray="2 3" />
                    {MEASURES.map((m, i) => {
                      const y = y0 + i * LINE
                      const c = r.cells[m]
                      return (
                        <g key={m}>
                          <text x={10} y={y + 9} dy="0.35em" fontSize={10.5} fill={INK.secondary}>
                            {axisLabel(m)} <tspan fill={INK.muted}>{BETTER_HIGH[m] ? "↑" : "↓"}</tspan>
                          </text>
                          {cell(r, ri, m, cx, y + 4, half, 10)}
                          <text x={w - 10} y={y + 9} dy="0.35em" textAnchor="end" fontSize={10.5} fill={c.value === null ? INK.muted : INK.primary} className="font-mono tabular-nums">
                            {c.value === null ? "—" : fmt(m, c.value)}
                          </text>
                          {hit(ri, m, 0, y, w, LINE, r)}
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </g>
          )
        }

        // Desktop: the full board.
        const RING = 64
        const NAME = Math.min(210, Math.max(150, w * 0.16))
        const left = RING + NAME
        const cw = (w - left) / MEASURES.length
        const half = cw / 2 - 7
        const bottom = HEAD + n * ROW
        return (
          <g>
            {defs}
            {/* Rows: a faint band each, brighter under the pointer. */}
            {board.rows.map((r, ri) => (
              <rect key={`band-${r.id}`} x={0} y={HEAD + ri * ROW + 3} width={w} height={ROW - 6} rx={10} fill={hover?.row === ri ? "rgba(255,255,255,0.05)" : ri % 2 ? "rgba(255,255,255,0.012)" : "rgba(255,255,255,0.025)"} style={{ transition: "fill 200ms" }} />
            ))}
            {MEASURES.map((m, i) => {
              const x0 = left + i * cw
              const cx = x0 + cw / 2
              const md = board.medians[m]
              const on = hover?.m === m
              return (
                <g key={m}>
                  {on && <rect x={x0 + 2} y={4} width={cw - 4} height={bottom - 2} rx={10} fill="rgba(57,135,229,0.07)" stroke="rgba(57,135,229,0.25)" />}
                  <text x={cx} y={18} textAnchor="middle" fontSize={11.5} fontWeight={500} fill={INK.primary}>
                    {axisLabel(m)}
                  </text>
                  <text x={cx} y={33} textAnchor="middle" fontSize={9.5} fill={INK.muted}>
                    {hint(m)}
                  </text>
                  <text x={cx} y={49} textAnchor="middle" fontSize={10} fill={INK.secondary} className="font-mono tabular-nums">
                    {md === null ? "—" : medianText(m, md)}
                  </text>
                  <line x1={cx} x2={cx} y1={HEAD - 4} y2={bottom} stroke={INK.axis} strokeDasharray="2 3" />
                </g>
              )
            })}
            {board.rows.map((r, ri) => {
              const y = HEAD + ri * ROW
              return (
                <g key={r.id}>
                  <Ring cx={RING / 2} cy={y + ROW / 2} r={18} row={r} measured={measuredOf(r)} />
                  <text x={RING} y={y + 25} fontSize={13} fontWeight={500} fill={INK.primary}>
                    <tspan fill={INK.muted} className="font-mono" fontSize={10.5}>
                      {String(ri + 1).padStart(2, "0")}
                    </tspan>
                    {"  "}
                    {clipName(r.name, Math.floor((NAME - 28) / 6.6))}
                  </text>
                  <text x={RING} y={y + 41} fontSize={10.5} fill={INK.muted}>
                    {summary(r)}
                  </text>
                  {hit(ri, null, 0, y, left, ROW, r)}
                  {MEASURES.map((m, i) => {
                    const cx = left + i * cw + cw / 2
                    const c = r.cells[m]
                    return (
                      <g key={m}>
                        {cell(r, ri, m, cx, y + 12, half, 14)}
                        <text x={cx} y={y + 44} textAnchor="middle" fontSize={10.5} fill={c.value === null ? INK.muted : hover?.row === ri || hover?.m === m ? INK.primary : INK.secondary} className="font-mono tabular-nums">
                          {c.value === null ? "—" : fmt(m, c.value)}
                        </text>
                        {hit(ri, m, left + i * cw, y, cw, ROW, r)}
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
