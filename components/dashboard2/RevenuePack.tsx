"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy"
import { interpolateZoom } from "d3-interpolate"
import type { Leaf, TreeNode } from "@/lib/interno/tablero2-x"
import { mxn } from "@/lib/materials/catalog"
import { useReducedMotion } from "@/lib/motion"
import { INK } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { TONE_COLOR } from "./NetworkRings"

type N = TreeNode | Leaf
type View = [number, number, number]

const isLeaf = (n: N): n is Leaf => !("children" in n)

/**
 * The money map: every deployment a circle, its towers inside, every client a dot whose area is what it pays per month
 * and whose color is how it stands with Cobranza. Click a deployment (or its button below) to fly into it; click its
 * background again or "Ver todo" to fly back out. The camera move is d3's smooth zoom (instant under reduced motion).
 */
export function RevenuePack({ tree, label, siteName, towerName, leafTip, allLabel }: { tree: TreeNode; label: string; siteName: (name: string) => string; towerName: (name: string) => string; leafTip: (l: Leaf) => { title: string; rows: { label: string; value: string }[] }; allLabel: string }) {
  const reduced = useReducedMotion()
  const [focus, setFocus] = useState("root")
  const sites = tree.children.filter((n): n is TreeNode => !isLeaf(n))
  return (
    <div className="grid gap-3">
      <Frame square height={(w) => Math.min(w, 560)} label={label}>
        {(size, tip) => <Packed size={size} tree={tree} focus={focus} setFocus={setFocus} reduced={reduced} tip={tip} siteName={siteName} towerName={towerName} leafTip={leafTip} />}
      </Frame>
      <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-1.5">
        <button type="button" aria-pressed={focus === "root"} onClick={() => setFocus("root")} className={`min-h-8 rounded-full border border-white/10 px-3 text-xs ${focus === "root" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/5"}`}>
          {allLabel}
        </button>
        {sites.map((s) => (
          <button key={s.id} type="button" aria-pressed={focus === s.id} onClick={() => setFocus(s.id)} className={`min-h-8 max-w-52 truncate rounded-full border border-white/10 px-3 text-xs ${focus === s.id ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/5"}`}>
            {siteName(s.name)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Packed({ size, tree, focus, setFocus, reduced, tip, siteName, towerName, leafTip }: { size: number; tree: TreeNode; focus: string; setFocus: (id: string) => void; reduced: boolean; tip: Tip; siteName: (name: string) => string; towerName: (name: string) => string; leafTip: (l: Leaf) => { title: string; rows: { label: string; value: string }[] } }) {
  const root = useMemo(
    () =>
      pack<N>()
        .size([size, size])
        .padding((d) => (d.depth === 0 ? 10 : d.depth === 1 ? 6 : 1.5))(
        hierarchy<N>(tree, (d) => (isLeaf(d) ? undefined : d.children))
          .sum((d) => (isLeaf(d) ? d.value : 0))
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      ),
    [tree, size]
  )
  const nodes = root.descendants()
  const target = nodes.find((n) => n.data.id === focus) ?? root
  const goal: View = [target.x, target.y, target.r * 2.05]
  const [view, setView] = useState<View>(goal)
  const from = useRef<View>(goal)
  // Fly the camera from where it is to the new focus (d3.interpolateZoom: zoom out, pan, zoom in).
  useEffect(() => {
    const start = from.current
    if (reduced || (start[0] === goal[0] && start[1] === goal[1] && start[2] === goal[2])) {
      from.current = goal
      const id = requestAnimationFrame(() => setView(goal))
      return () => cancelAnimationFrame(id)
    }
    const i = interpolateZoom(start, goal)
    const dur = Math.min(1400, Math.max(500, i.duration))
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const v = i(e) as View
      from.current = v
      setView(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [goal[0], goal[1], goal[2], reduced]) // eslint-disable-line react-hooks/exhaustive-deps -- the goal's numbers are the dependency (the array is new each render)
  const k = size / view[2]
  const P = (n: HierarchyCircularNode<N>) => ({ x: (n.x - view[0]) * k + size / 2, y: (n.y - view[1]) * k + size / 2, r: n.r * k })
  const focusDepth = target.depth
  return (
    // Zoomed in, the neighbours run off the edge: keep them inside the square.
    <g clipPath="url(#t2-pack-clip)">
      <defs>
        <clipPath id="t2-pack-clip">
          <rect width={size} height={size} rx={12} />
        </clipPath>
      </defs>
      <rect width={size} height={size} fill="transparent" onClick={() => setFocus("root")} />
      {nodes.map((n) => {
        if (n.depth === 0) return null
        const p = P(n)
        if (p.x + p.r < -20 || p.x - p.r > size + 20 || p.y + p.r < -20 || p.y - p.r > size + 20 || p.r < 0.4) return null
        if (isLeaf(n.data)) {
          const leaf = n.data
          return (
            <circle
              key={leaf.id}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={TONE_COLOR[leaf.tone]}
              fillOpacity={0.9}
              stroke={INK.surface}
              strokeWidth={p.r > 6 ? 1 : 0.4}
              onPointerMove={(e) => {
                const t = leafTip(leaf)
                tip.show(e, <TipBody title={t.title} rows={t.rows} />)
              }}
              onPointerLeave={tip.hide}
            />
          )
        }
        const site = n.depth === 1
        const towers = (n.children ?? []).filter((c) => !isLeaf(c.data))
        return (
          <circle
            key={n.data.id}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={site ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)"}
            stroke={site ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)"}
            strokeDasharray={site ? undefined : "2 3"}
            style={{ cursor: site && focusDepth === 0 ? "zoom-in" : "zoom-out" }}
            onClick={(e) => {
              e.stopPropagation()
              setFocus(site ? (focus === n.data.id ? "root" : n.data.id) : n.parent?.data.id ?? "root")
            }}
            onPointerMove={(e) => tip.show(e, <TipBody title={site ? siteName((n.data as TreeNode).name) : towerName((n.data as TreeNode).name)} rows={[{ label: "", value: `${mxn(n.value ?? 0)} · ${n.leaves().length}` }, ...(site && towers.length > 1 ? [{ label: "", value: `${towers.length} torres` }] : [])]} />)}
            onPointerLeave={tip.hide}
          />
        )
      })}
      {nodes
        .filter((n) => !isLeaf(n.data) && n.depth === focusDepth + 1)
        .map((n) => {
          const p = P(n)
          if (p.r < 24) return null
          const name = n.depth === 1 ? siteName((n.data as TreeNode).name) : towerName((n.data as TreeNode).name)
          if (!name) return null
          return (
            <g key={`l-${n.data.id}`} className="pointer-events-none" textAnchor="middle">
              <text x={p.x} y={p.y - p.r + 17} fontSize={11.5} fill={INK.primary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke">
                {name.length * 6.2 > p.r * 2.4 ? `${name.slice(0, Math.max(4, Math.floor((p.r * 2.4) / 6.2) - 1))}…` : name}
              </text>
              <text x={p.x} y={p.y + p.r - 9} fontSize={10.5} fill={INK.secondary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke" className="tabular-nums">
                {mxn(n.value ?? 0)}
              </text>
            </g>
          )
        })}
    </g>
  )
}
