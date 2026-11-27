"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { findPath, HEADER, isLeaf, layoutLevel, marginTone, paidShare, stats, type Margin, type Rect, type Tile } from "@/lib/interno/tablero2-tree"
import type { Leaf, TreeNode } from "@/lib/interno/tablero2-x"
import { useReducedMotion } from "@/lib/motion"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { clipName, pct, pesos } from "./format"

/**
 * Margin bar: blue when a deployment keeps 10 % or more, gray about even, a gray hatch when it loses money (orange and
 * red stay reserved for the clients' status; validated on the dark card: blue ↔ gray ΔE 18.8).
 */
export const MARGIN_COLOR = { good: "#3987e5", even: "#6f6e69", loss: "url(#tm-hatch)", none: "transparent" } as const
export const HATCH = "#8a8984"
/** Client tiles: calm unless something is wrong (status colors). */
export const TILE_COLOR = { calm: "#2a3b55", due: "#56657a", late: STATUS.serious, suspended: STATUS.critical, free: "#1b2028" } as const
const TANK = "#3987e5"

export type TreemapLabels = {
  site: (name: string) => string
  tower: (name: string) => string
  paid: (share: string) => string
  margin: (share: string) => string
  rows: { monthly: string; paid: string; clients: string; late: string; suspended: string; margin: string; profit: string; incomplete: string }
  leafTip: (l: Leaf) => { title: string; rows: { label: string; value: string }[] }
  all: string
  enter: string
  up: string
}

type Anim = { phase: "out" | "in"; from: Rect; to: Rect; t: number; next: string | null }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x0: lerp(a.x0, b.x0, t), y0: lerp(a.y0, b.y0, t), x1: lerp(a.x1, b.x1, t), y1: lerp(a.y1, b.y1, t) })

/**
 * Mapa de ingresos: a treemap of the monthly revenue, deployment → tower → client. Area = what it charges a month; the
 * blue that fills a tile from the bottom = how much of it is paid this month; a deployment's top bar = its margin.
 * Clients stay quiet unless late (orange) or suspended (red). Click a tile (or its button) to go in: the tile grows to
 * fill the frame and its insides fade in; "Todo" or a step of the path goes back out (instant under reduced motion).
 */
export function RevenueTreemap({ tree, margins, label, labels }: { tree: TreeNode; margins: Map<string, Margin>; label: string; labels: TreemapLabels }) {
  const reduced = useReducedMotion()
  const [focusId, setFocusId] = useState("root")
  const [anim, setAnim] = useState<Anim | null>(null)
  // The box, measured here (the layout and the tween need it outside Frame's render prop).
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [bw, setBw] = useState(0)
  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(([e]) => setBw(Math.floor(e.contentRect.width)))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])
  const size = useMemo(() => ({ w: bw, h: bw < 640 ? 400 : 500 }), [bw])
  const path = useMemo(() => {
    const p = findPath(tree, focusId)
    return p.length ? p : [tree]
  }, [tree, focusId])
  const focus = path[path.length - 1]
  const tiles = useMemo(() => layoutLevel(focus, size.w, size.h), [focus, size])
  const raf = useRef(0)
  const animRef = useRef<Anim | null>(null)
  useEffect(() => {
    animRef.current = anim
  })
  const phaseKey = anim ? `${anim.phase}:${anim.next ?? ""}` : ""

  // The tween: "out" grows (or shrinks) the tile while the old level fades, then the new level fades "in".
  useEffect(() => {
    const a0 = animRef.current
    if (!phaseKey || !a0) return
    const dur = a0.phase === "out" ? 380 : 260
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const cur = animRef.current
      if (!cur) return
      if (t < 1) {
        setAnim({ ...cur, t })
        raf.current = requestAnimationFrame(step)
      } else if (cur.phase === "out") {
        if (cur.next) setFocusId(cur.next)
        setAnim({ ...cur, phase: "in", t: 0 })
      } else setAnim(null)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [phaseKey])

  const full: Rect = { x0: 0, y0: 0, x1: size.w, y1: size.h }
  const go = (id: string) => {
    if (id === focusId || anim) return
    if (reduced || !size.w) return setFocusId(id)
    const into = tiles.find((t) => t.depth === 1 && !isLeaf(t.node) && t.node.id === id)
    if (into) return setAnim({ phase: "out", from: into, to: full, t: 0, next: id })
    // Going out: the current focus shrinks to its place in the level we go back to.
    const target = findPath(tree, id)
    const back = target.length ? layoutLevel(target[target.length - 1], size.w, size.h).find((t) => t.depth === 1 && !isLeaf(t.node) && path.some((p) => p.id === t.node.id)) : undefined
    setAnim({ phase: "out", from: full, to: back ?? full, t: 0, next: id })
  }

  const kids = focus.children.filter((c): c is TreeNode => !isLeaf(c) && stats(c).value > 0)
  const nameOf = (n: TreeNode) => (n.id.startsWith("s:") ? labels.site(n.name) : labels.tower(n.name))

  return (
    <div className="grid gap-2">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5 text-xs">
        {path.map((p, i) => {
          const last = i === path.length - 1
          return (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-zinc-600">/</span>}
              <button type="button" onClick={() => go(p.id)} aria-current={last ? "location" : undefined} className={`min-h-8 rounded-full px-2.5 ${last ? "bg-white/10 text-zinc-50" : "text-zinc-300 underline decoration-white/20 underline-offset-4 hover:text-zinc-50"} focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none`}>
                {i === 0 ? labels.all : nameOf(p)}
              </button>
            </span>
          )
        })}
        {kids.length > 0 && (
          <span className="ml-auto inline-flex flex-wrap items-center gap-1">
            <span className="text-zinc-500">{labels.enter}</span>
            {kids.map((c) => (
              <button key={c.id} type="button" onClick={() => go(c.id)} className="min-h-8 rounded-full border border-white/10 px-2.5 text-zinc-300 hover:bg-white/5 hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
                {clipName(nameOf(c), 18)}
              </button>
            ))}
          </span>
        )}
      </div>
      <div ref={setBox}>
        <Frame height={(w) => (w < 640 ? 400 : 500)} label={label}>
          {(w, tip) => <Scene tiles={tiles} margins={margins} labels={labels} tip={tip} anim={anim} full={{ x0: 0, y0: 0, x1: w, y1: w < 640 ? 400 : 500 }} onGo={go} canGoUp={path.length > 1} onUp={() => go(path[path.length - 2]?.id ?? "root")} />}
        </Frame>
      </div>
    </div>
  )
}

function Scene({ tiles, margins, labels, tip, anim, full, onGo, canGoUp, onUp }: { tiles: Tile[]; margins: Map<string, Margin>; labels: TreemapLabels; tip: Tip; anim: Anim | null; full: Rect; onGo: (id: string) => void; canGoUp: boolean; onUp: () => void }) {
  const fade = !anim ? 1 : anim.phase === "out" ? 1 - ease(anim.t) : ease(anim.t)
  const portal = anim && anim.phase === "out" ? lerpRect(anim.from, anim.to, ease(anim.t)) : null
  const containerTip = (n: TreeNode) => {
    const st = stats(n)
    const m = n.id.startsWith("s:") ? margins.get(n.id.slice(2)) : undefined
    return (
      <TipBody
        title={n.id.startsWith("s:") ? labels.site(n.name) : labels.tower(n.name)}
        rows={[
          { label: labels.rows.monthly, value: pesos(st.value) },
          { label: labels.rows.paid, value: pct(paidShare(st)) },
          { label: labels.rows.clients, value: String(st.clients) },
          ...(st.late ? [{ label: labels.rows.late, value: String(st.late), color: TILE_COLOR.late }] : []),
          ...(st.suspended ? [{ label: labels.rows.suspended, value: String(st.suspended), color: TILE_COLOR.suspended }] : []),
          ...(m && m.margin !== null ? [{ label: labels.rows.margin, value: `${pct(m.margin)}${m.incomplete ? ` · ${labels.rows.incomplete}` : ""}`, color: marginTone(m.margin) === "loss" ? HATCH : MARGIN_COLOR[marginTone(m.margin)] }, { label: labels.rows.profit, value: pesos(m.profit) }] : []),
        ]}
      />
    )
  }
  return (
    <g>
      <defs>
        <linearGradient id="tm-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2130" />
          <stop offset="100%" stopColor="#0d1117" />
        </linearGradient>
        <pattern id="tm-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#2a2a28" />
          <rect width="3" height="6" fill={HATCH} />
        </pattern>
        <filter id="tm-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* The background: a click on it goes one level up. */}
      <rect x={0} y={0} width={full.x1} height={full.y1} fill="transparent" onClick={() => canGoUp && onUp()} />
      <g style={{ opacity: fade }}>
        {tiles
          .filter((t) => t.depth === 1)
          .map((t) => {
            const inner = tiles.filter((x) => x.depth === 2 && x.parent === (t.node as TreeNode).id)
            return isLeaf(t.node) ? (
              <ClientTile key={t.node.id} t={t} leaf={t.node} labels={labels} tip={tip} big />
            ) : (
              <Container key={t.node.id} t={t} node={t.node} inner={inner} margin={t.node.id.startsWith("s:") ? margins.get(t.node.id.slice(2)) : undefined} labels={labels} tip={tip} tipBody={containerTip} onGo={onGo} />
            )
          })}
      </g>
      {portal && <rect x={portal.x0} y={portal.y0} width={Math.max(0, portal.x1 - portal.x0)} height={Math.max(0, portal.y1 - portal.y0)} rx={8} fill="#11151c" stroke="#5598e7" strokeOpacity={0.35} pointerEvents="none" />}
    </g>
  )
}

function Container({ t, node, inner, margin, labels, tip, tipBody, onGo }: { t: Tile; node: TreeNode; inner: Tile[]; margin: Margin | undefined; labels: TreemapLabels; tip: Tip; tipBody: (n: TreeNode) => React.ReactNode; onGo: (id: string) => void }) {
  const [hot, setHot] = useState(false)
  const w = t.x1 - t.x0
  const h = t.y1 - t.y0
  const st = stats(node)
  const paid = paidShare(st)
  const header = h > HEADER * 2 && inner.length > 0
  const site = node.id.startsWith("s:")
  const tone = margin ? marginTone(margin.margin) : "none"
  const name = site ? labels.site(node.name) : labels.tower(node.name)
  const id = `tm-clip-${node.id.replace(/[^\w-]/g, "_")}`
  const chars = Math.floor((w - 18) / 7)
  const amount = pesos(st.value)
  const showAmount = w > 70 + amount.length * 7 + 40
  return (
    <g style={{ cursor: "zoom-in" }}
      onClick={(e) => { e.stopPropagation(); onGo(node.id) }}
      onPointerMove={(e) => { setHot(true); tip.show(e, tipBody(node)) }}
      onPointerLeave={() => { setHot(false); tip.hide() }}
    >
      <clipPath id={id}>
        <rect x={t.x0} y={t.y0} width={w} height={h} rx={9} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={t.x0} y={t.y0} width={w} height={h} fill="url(#tm-sheen)" />
        {inner.map((g) => (isLeaf(g.node) ? <ClientTile key={g.node.id} t={g} leaf={g.node} labels={labels} tip={tip} /> : null))}
        {site && tone !== "none" && <rect x={t.x0} y={t.y0} width={w} height={tone === "loss" ? 5 : 3} fill={MARGIN_COLOR[tone]} />}
      </g>
      <rect x={t.x0 + 0.5} y={t.y0 + 0.5} width={w - 1} height={h - 1} rx={9} fill="none" stroke={hot ? "#9ec5f4" : "#ffffff"} strokeOpacity={hot ? 0.55 : 0.08} style={{ transition: "stroke-opacity .2s" }} />
      {header && chars > 3 && (
        <g pointerEvents="none">
          <text x={t.x0 + 10} y={t.y0 + 17} fill={INK.primary} fontSize={12.5} fontWeight={500}>
            {clipName(name, Math.max(4, chars - (showAmount ? amount.length + 2 : 0)))}
          </text>
          {showAmount && (
            <text x={t.x1 - 10} y={t.y0 + 17} textAnchor="end" fill={INK.secondary} fontSize={11.5} className="font-mono tabular-nums">
              {amount}
            </text>
          )}
          {/* Paid this month: a hairline under the header. */}
          {paid !== null && w > 40 && (
            <g>
              <rect x={t.x0 + 10} y={t.y0 + 23} width={w - 20} height={2} rx={1} fill="#ffffff" fillOpacity={0.07} />
              <rect x={t.x0 + 10} y={t.y0 + 23} width={(w - 20) * paid} height={2} rx={1} fill={TANK} />
            </g>
          )}
        </g>
      )}
    </g>
  )
}

/**
 * A client: a solid square when this month is paid, a hollow one while it isn't due yet, orange when late, red (with a
 * glow on its own tile) when suspended. As a big tile (a tower's clients) it also says where it is and what it pays.
 */
function ClientTile({ t, leaf, labels, tip, big = false }: { t: Tile; leaf: Leaf; labels: TreemapLabels; tip: Tip; big?: boolean }) {
  const [hot, setHot] = useState(false)
  const w = t.x1 - t.x0
  const h = t.y1 - t.y0
  if (w < 1 || h < 1) return null
  const loud = leaf.tone === "atrasado" || leaf.tone === "suspendido"
  const hollow = leaf.tone === "por-vencer"
  const fill = leaf.tone === "atrasado" ? TILE_COLOR.late : leaf.tone === "suspendido" ? TILE_COLOR.suspended : leaf.tone === "sin-cobro" ? TILE_COLOR.free : hollow ? "transparent" : TILE_COLOR.calm
  const info = labels.leafTip(leaf)
  const inset = hollow ? 0.75 : 0
  const title = leaf.place || leaf.plan || "—"
  return (
    <g onPointerMove={(e) => { e.stopPropagation(); setHot(true); tip.show(e, <TipBody title={info.title} rows={info.rows} />) }} onPointerLeave={() => { setHot(false); tip.hide() }}>
      <rect x={t.x0 + inset} y={t.y0 + inset} width={Math.max(0, w - inset * 2)} height={Math.max(0, h - inset * 2)} rx={big ? 7 : Math.min(3, w / 4)} fill={fill} fillOpacity={loud ? 0.95 : 1} filter={leaf.tone === "suspendido" && big ? "url(#tm-glow)" : undefined} stroke={hot ? "#e8f1ff" : hollow ? "#56657a" : "none"} strokeOpacity={hot ? 0.9 : 0.8} strokeWidth={hot ? 1.5 : 1} />
      {big && w > 70 && h > 34 && (
        <g pointerEvents="none">
          <text x={t.x0 + 9} y={t.y0 + 18} fill={loud ? "#0e0e10" : INK.primary} fontSize={12} fontWeight={500}>
            {clipName(title, Math.floor((w - 18) / 6.8))}
          </text>
          {h > 50 && (
            <text x={t.x0 + 9} y={t.y0 + 34} fill={loud ? "#0e0e10" : INK.muted} fontSize={10.5} className="font-mono tabular-nums">
              {pesos(leaf.value)}
              {leaf.plan && leaf.plan !== title && w > 120 ? ` · ${leaf.plan}` : ""}
            </text>
          )}
        </g>
      )}
    </g>
  )
}
