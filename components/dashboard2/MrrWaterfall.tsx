"use client"

import { scaleBand, scaleLinear } from "d3-scale"
import type { Bridge } from "@/lib/interno/tablero2"
import { mxn } from "@/lib/materials/catalog"
import { INK, SERIES } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { k } from "./format"

export const BRIDGE_COLOR = { total: SERIES[0], up: SERIES[2], down: SERIES[1] } as const

type Step = { key: "start" | "added" | "more" | "less" | "lost" | "end"; label: string; hint: string; from: number; to: number; kind: keyof typeof BRIDGE_COLOR; value: number }

/**
 * The recurring revenue bridge: where the month started, what new clients and upgrades added, what downgrades and
 * cancellations took, and where it ended. Totals from zero (honest heights), steps floating, dotted connectors.
 */
export function MrrWaterfall({ bridge, label, labels, hint }: { bridge: Bridge; label: string; labels: Record<Step["key"], string>; hint: (key: "added" | "more" | "less" | "lost", n: number) => string }) {
  let at = bridge.start
  const steps: Step[] = [{ key: "start", label: labels.start, hint: "", from: 0, to: bridge.start, kind: "total", value: bridge.start }]
  for (const key of ["added", "more", "less", "lost"] as const) {
    const up = key === "added" || key === "more"
    const next = at + (up ? bridge[key] : -bridge[key])
    steps.push({ key, label: labels[key], hint: hint(key, bridge.counts[key]), from: at, to: next, kind: up ? "up" : "down", value: up ? bridge[key] : -bridge[key] })
    at = next
  }
  steps.push({ key: "end", label: labels.end, hint: "", from: 0, to: bridge.end, kind: "total", value: bridge.end })
  return (
    <Frame height={260} label={label}>
      {(w, tip) => {
        const m = { top: 26, right: 4, bottom: 44, left: 40 }
        const x = scaleBand<string>()
          .domain(steps.map((s) => s.key))
          .range([m.left, w - m.right])
          .paddingInner(0.36)
          .paddingOuter(0.1)
        const y = scaleLinear()
          .domain([0, Math.max(1, ...steps.map((s) => Math.max(s.from, s.to))) * 1.06])
          .nice()
          .range([260 - m.bottom, m.top])
        const bw = Math.min(64, x.bandwidth())
        return (
          <g>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} stroke={INK.grid} />
                <text x={m.left - 6} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill={INK.muted}>
                  {k(t)}
                </text>
              </g>
            ))}
            {steps.map((s, i) => {
              const cx = (x(s.key) ?? 0) + x.bandwidth() / 2
              const top = y(Math.max(s.from, s.to))
              const bottom = y(Math.min(s.from, s.to))
              const hgt = Math.max(2, bottom - top)
              const next = steps[i + 1]
              return (
                <g
                  key={s.key}
                  onPointerMove={(e) => tip.show(e, <TipBody title={s.label} rows={[{ label: s.hint || "", value: s.kind === "total" ? mxn(s.value) : `${s.value >= 0 ? "+" : "−"}${mxn(Math.abs(s.value))}`, color: BRIDGE_COLOR[s.kind] }]} />)}
                  onPointerLeave={tip.hide}
                >
                  <rect x={(x(s.key) ?? 0) - 4} y={m.top} width={x.bandwidth() + 8} height={260 - m.bottom - m.top} fill="transparent" />
                  <rect x={cx - bw / 2} y={top} width={bw} height={hgt} rx={4} fill={BRIDGE_COLOR[s.kind]} opacity={s.kind === "total" ? 1 : 0.92} className="t2-rise" style={{ animationDelay: `${i * 70}ms` }} />
                  {next && <line x1={cx + bw / 2} x2={(x(next.key) ?? 0) + x.bandwidth() / 2 - bw / 2} y1={y(s.to)} y2={y(s.to)} stroke={INK.muted} strokeDasharray="2 3" />}
                  <text x={cx} y={top - 7} textAnchor="middle" fontSize={11} fill={INK.primary} className="tabular-nums">
                    {s.kind === "total" ? k(s.value) : s.value === 0 ? "0" : `${s.value > 0 ? "+" : "−"}${k(Math.abs(s.value))}`}
                  </text>
                  <text x={cx} y={260 - m.bottom + 16} textAnchor="middle" fontSize={w < 420 ? 10 : 11} fill={INK.secondary}>
                    {s.label}
                  </text>
                  {s.hint && x.bandwidth() >= 56 && (
                    <text x={cx} y={260 - m.bottom + 30} textAnchor="middle" fontSize={10} fill={INK.muted}>
                      {s.hint}
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
