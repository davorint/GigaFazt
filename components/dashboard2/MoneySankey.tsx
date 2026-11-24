"use client"

import { useMemo, useState } from "react"
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey"
import type { FlowKind, MoneyFlow } from "@/lib/interno/tablero2"
import { mxn } from "@/lib/materials/catalog"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { clipName, k } from "./format"

/** Income is blue; each cost and what's left keep their own categorical slot; a loss is the critical status. */
export const FLOW_COLOR: Record<FlowKind, string> = { plan: SERIES[0], tv: "#5598e7", otros: "#5598e7", faltante: STATUS.critical, site: "#6f6e69", nosite: "#6f6e69", edificio: SERIES[3], enlaces: SERIES[1], utilidad: SERIES[2] }

type N = { id: string; kind: FlowKind; name: string }
type L = { source: string; target: string; value: number }

const clip = (s: string, px: number) => {
  const n = Math.max(3, Math.floor(px / 6))
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

/**
 * This month's money as it flows: each plan's income into the deployments, and out of each deployment into the
 * building, the links and what's left. Bands are amounts per month; hover one to read it, the rest step back.
 */
export function MoneySankey({ flow, label, name }: { flow: MoneyFlow; label: string; name: (kind: FlowKind, label: string) => string }) {
  const [hover, setHover] = useState<string | null>(null)
  const height = Math.max(300, Math.min(560, flow.nodes.filter((n) => n.kind === "site" || n.kind === "nosite").length * 46 + 80))
  return (
    <Frame height={height} label={label}>
      {(w, tip) => <Drawing w={w} h={height} flow={flow} name={name} hover={hover} setHover={setHover} tip={tip} />}
    </Frame>
  )
}

function Drawing({ w, h, flow, name, hover, setHover, tip }: { w: number; h: number; flow: MoneyFlow; name: (kind: FlowKind, label: string) => string; hover: string | null; setHover: (id: string | null) => void; tip: Tip }) {
  const graph = useMemo(() => {
    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeAlign(sankeyJustify)
      .nodeWidth(10)
      .nodePadding(w < 560 ? 10 : 16)
      .nodeSort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .extent([
        [1, 6],
        [w - 1, h - 6],
      ])
    return layout({ nodes: flow.nodes.map((n) => ({ id: n.id, kind: n.kind, name: name(n.kind, n.label) })), links: flow.links.map((l) => ({ ...l })) })
  }, [flow, w, h, name])
  const columns = [...new Set(graph.nodes.map((n) => n.x0 ?? 0))].sort((a, b) => a - b)
  const gapPx = columns.length > 1 ? columns[1] - columns[0] - 24 : w
  const path = sankeyLinkHorizontal<N, L>()
  const near = (l: SankeyLink<N, L>) => hover === null || hover === (l.source as SankeyNode<N, L>).id || hover === (l.target as SankeyNode<N, L>).id || hover === `${(l.source as N).id}>${(l.target as N).id}`
  return (
    <g>
      <defs>
        {graph.links.map((l, i) => {
          const s = l.source as SankeyNode<N, L>
          const t = l.target as SankeyNode<N, L>
          return (
            <linearGradient key={i} id={`t2-flow-${i}`} gradientUnits="userSpaceOnUse" x1={s.x1} x2={t.x0}>
              <stop offset="0%" stopColor={FLOW_COLOR[s.kind]} />
              <stop offset="100%" stopColor={FLOW_COLOR[t.kind]} />
            </linearGradient>
          )
        })}
      </defs>
      <g fill="none">
        {graph.links.map((l, i) => {
          const s = l.source as SankeyNode<N, L>
          const t = l.target as SankeyNode<N, L>
          const on = near(l)
          return (
            <path
              key={i}
              d={path(l) ?? ""}
              stroke={`url(#t2-flow-${i})`}
              strokeWidth={Math.max(1, l.width ?? 1)}
              strokeOpacity={on ? (hover ? 0.62 : 0.34) : 0.08}
              style={{ transition: "stroke-opacity 200ms" }}
              onPointerMove={(e) => {
                setHover(`${s.id}>${t.id}`)
                tip.show(e, <TipBody title={`${s.name} → ${t.name}`} rows={[{ label: "", value: mxn(l.value) }]} />)
              }}
              onPointerLeave={() => {
                setHover(null)
                tip.hide()
              }}
            />
          )
        })}
      </g>
      {graph.nodes.map((n) => {
        const x0 = n.x0 ?? 0
        const x1 = n.x1 ?? 0
        const y0 = n.y0 ?? 0
        const y1 = n.y1 ?? 0
        const last = x1 >= w - 2
        const tx = last ? x0 - 6 : x1 + 6
        const on = hover === null || hover === n.id || hover.split(">").includes(n.id)
        // On a phone the middle and right labels share the gap between them and show names only (amounts in the tooltip and the table).
        const narrow = w < 560
        const middle = !last && x0 > 2
        const room = narrow && (middle || last) ? gapPx * (middle ? 0.42 : 0.55) : gapPx - 44
        return (
          <g
            key={n.id}
            opacity={on ? 1 : 0.4}
            style={{ transition: "opacity 200ms" }}
            onPointerMove={(e) => {
              setHover(n.id)
              tip.show(e, <TipBody title={n.name} rows={[{ label: "", value: mxn(n.value ?? 0) }]} />)
            }}
            onPointerLeave={() => {
              setHover(null)
              tip.hide()
            }}
          >
            <rect x={x0} y={y0} width={x1 - x0} height={Math.max(2, y1 - y0)} rx={3} fill={FLOW_COLOR[n.kind]} />
            {y1 - y0 >= 9 && (
              <text x={tx} y={(y0 + y1) / 2} dy="0.35em" textAnchor={last ? "end" : "start"} fontSize={11} fill={INK.primary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
                {n.kind === "site" ? clipName(n.name, Math.max(3, Math.floor(room / 6))) : clip(n.name, room)} {!(narrow && (middle || last)) && <tspan fill={INK.secondary}>{k(n.value ?? 0)}</tspan>}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
