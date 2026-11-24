"use client"

import { useState } from "react"
import { chord, ribbon, type Chord } from "d3-chord"
import { arc } from "d3-shape"
import type { FaultMatrix } from "@/lib/interno/tablero2-x"
import type { RepairGroup } from "@/lib/interno/tablero2-more"
import { INK } from "@/components/dashboard/theme"
import { Frame, TipBody } from "./Frame"
import { REPAIR_COLOR } from "./RepairGantt"
import { clipName } from "./format"

const SITE_GRAY = ["#6f6e69", "#5d5c58", "#807f79", "#53524e"]

/**
 * What fails and where: deployments on one side of the ring, kinds of fault on the other, and a ribbon for every pair
 * as wide as its reports. Ribbons wear the color of the kind; deployments stay gray. Hover an arc to light its ribbons.
 */
export function FaultChord({ m, label, siteName, kindLabel, reportsLabel }: { m: FaultMatrix; label: string; siteName: (name: string) => string; kindLabel: (k: RepairGroup) => string; reportsLabel: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const S = m.sites.length
  const N = S + m.kinds.length
  const matrix = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i < S && j >= S ? m.counts[i][j - S] : i >= S && j < S ? m.counts[j][i - S] : 0)))
  const names = [...m.sites.map((s) => siteName(s.name)), ...m.kinds.map(kindLabel)]
  const colorOf = (i: number) => (i < S ? SITE_GRAY[i % SITE_GRAY.length] : REPAIR_COLOR[m.kinds[i - S]])
  return (
    <Frame height={(w) => (w < 520 ? Math.min(w + 40, 420) : 560)} label={label}>
      {(w, tip) => {
        // As wide as the panel: the ring in the middle, the names with room on both sides.
        const h = w < 520 ? Math.min(w + 40, 420) : 560
        const room = w < 520 ? 62 : 170
        const outer = Math.max(60, Math.min(h / 2 - (w < 520 ? 56 : 80), w / 2 - room - 10))
        // How far a name can run from the ring before leaving the frame, in its direction (angle 0 = up, clockwise).
        const reach = (a: number) => Math.min(Math.abs(Math.sin(a)) > 0.02 ? (w / 2 - outer - 12) / Math.abs(Math.sin(a)) : Infinity, Math.abs(Math.cos(a)) > 0.02 ? (h / 2 - outer - 12) / Math.abs(Math.cos(a)) : Infinity)
        const inner = outer - 12
        const chords = chord().padAngle(0.035).sortSubgroups((a, b) => b - a)(matrix)
        const ring = arc<{ startAngle: number; endAngle: number }>().innerRadius(inner).outerRadius(outer).cornerRadius(2)
        const band = ribbon<Chord, { startAngle: number; endAngle: number }>().radius(inner - 2)
        const lit = (c: Chord) => hover === null || c.source.index === hover || c.target.index === hover
        return (
          <g transform={`translate(${w / 2},${h / 2})`}>
            {chords.map((c, i) => {
              const kind = c.source.index >= S ? c.source.index : c.target.index
              const site = c.source.index < S ? c.source.index : c.target.index
              return (
                <path
                  key={i}
                  d={(band(c) as unknown as string) ?? ""}
                  fill={colorOf(kind)}
                  fillOpacity={lit(c) ? (hover === null ? 0.62 : 0.85) : 0.06}
                  stroke={INK.surface}
                  strokeWidth={0.5}
                  style={{ transition: "fill-opacity 200ms" }}
                  className="t2-fade"
                  onPointerMove={(e) => tip.show(e, <TipBody title={`${names[site]} · ${names[kind]}`} rows={[{ label: "", value: reportsLabel(c.source.value), color: colorOf(kind) }]} />)}
                  onPointerLeave={tip.hide}
                />
              )
            })}
            {chords.groups.map((g) => {
              // A kind with no reports has no arc: no label either (it would sit on its neighbour's).
              if (!g.value) return null
              const mid = (g.startAngle + g.endAngle) / 2
              const flip = mid > Math.PI
              const deg = (mid * 180) / Math.PI - 90
              const txt = names[g.index]
              return (
                <g
                  key={g.index}
                  onPointerMove={(e) => {
                    setHover(g.index)
                    tip.show(e, <TipBody title={txt} rows={[{ label: "", value: reportsLabel(g.value), color: colorOf(g.index) }]} />)
                  }}
                  onPointerLeave={() => {
                    setHover(null)
                    tip.hide()
                  }}
                >
                  <path d={ring(g) ?? ""} fill={colorOf(g.index)} />
                  <text transform={`rotate(${deg}) translate(${outer + 8},0)${flip ? " rotate(180)" : ""}`} textAnchor={flip ? "end" : "start"} dy="0.35em" fontSize={10.5} fill={g.index < S ? INK.secondary : INK.primary}>
                    {txt.length * 5.8 <= reach(mid) ? txt : g.index < S ? clipName(txt, Math.max(4, Math.floor(reach(mid) / 5.8))) : `${txt.slice(0, Math.max(3, Math.floor(reach(mid) / 5.8) - 1))}…`}
                  </text>
                </g>
              )
            })}
          </g>
        )
      }}
    </Frame>
  )
}
