"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { arc } from "d3-shape"
import { cellLayout, findPath, fitInto, isLeaf, marginTone, paidShare, polyPath, stats, type Cell, type Margin } from "@/lib/interno/tablero2-tree"
import type { Leaf, TreeNode } from "@/lib/interno/tablero2-x"
import type { Tone } from "@/lib/interno/tablero2"
import { useReducedMotion } from "@/lib/motion"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { clipName, pct, pesos } from "./format"

/**
 * Margin chip: blue when a deployment keeps 10 % or more, gray about even, a gray hatch when it loses money (orange and
 * red stay reserved for the clients' status; validated on the dark card: blue ↔ gray ΔE 18.8).
 */
export const MARGIN_COLOR = { good: "#3987e5", even: "#6f6e69", loss: "url(#rm-hatch)", none: "transparent" } as const
export const HATCH = "#8a8984"
/** Client cells: calm unless something is wrong (status colors). */
export const TILE_COLOR = { calm: "#2a3b55", due: "#56657a", late: STATUS.serious, suspended: STATUS.critical, free: "#1b2028" } as const
/** The dial's slots, in order around the circle from 12 o'clock. */
const DIAL = ["al-corriente", "por-vencer", "atrasado", "suspendido", "sin-cobro"] as const
const DIAL_COLOR: Record<(typeof DIAL)[number], string> = { "al-corriente": "#3987e5", "por-vencer": TILE_COLOR.due, atrasado: TILE_COLOR.late, suspendido: TILE_COLOR.suspended, "sin-cobro": "#34342f" }
/** The tones a viewer can isolate on the map (the four that owe something this month). */
const PICKS = ["al-corriente", "por-vencer", "atrasado", "suspendido"] as const
type Pick = (typeof PICKS)[number]
const MAX = 720
const FLY = 560

export type RevenueLabels = {
  share: string
  site: (name: string) => string
  tower: (name: string) => string
  rows: { monthly: string; paid: string; clients: string; late: string; suspended: string; margin: string; profit: string; incomplete: string }
  leafTip: (l: Leaf) => { title: string; rows: { label: string; value: string }[] }
  all: string
  monthly: string
  clientsLine: (n: number, avg: string) => string
  month: string
  tones: Record<Pick, string>
  paidShare: (share: string) => string
  lists: { sites: string; towers: string; clients: string }
  margin: (share: string) => string
  more: (n: number) => string
  hint: string
}

type Fit = { k: number; x: number; y: number }

/**
 * Mapa de ingresos: the monthly revenue as nested Voronoi cells in a circle, deployment → tower → client (area = what
 * it charges a month). Clients are glass: deep blue when this month is paid, hollow while it isn't due yet, orange late,
 * red suspended. Light lines draw the deployments, finer ones the towers; a dial around the circle says how this
 * month's money stands. Beside it, the ledger: the total, the month's standing (buttons that isolate a status on the
 * map) and the cells one level down (hover = light it, press = fly in). The camera flies into a cell and back out
 * (instant under reduced motion).
 */
export function RevenueMap({ tree, margins, label, labels }: { tree: TreeNode; margins: Map<string, Margin>; label: string; labels: RevenueLabels }) {
  const reduced = useReducedMotion()
  const [focusId, setFocusId] = useState("root")
  const [hot, setHot] = useState<string | null>(null)
  const [only, setOnly] = useState<Pick | null>(null)
  const [fly, setFly] = useState<(Fit & { id: string }) | null>(null)
  const [from, setFrom] = useState<Fit | null>(null)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [bw, setBw] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(([e]) => setBw(Math.floor(e.contentRect.width)))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])
  useEffect(() => () => clearTimeout(timer.current), [])
  // Flying out: the new level mounts zoomed into where we came from, then (two frames later) eases back to the whole.
  useEffect(() => {
    if (!from) return
    let b = 0
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setFrom(null))))
    return () => {
      cancelAnimationFrame(a)
      cancelAnimationFrame(b)
    }
  }, [from])

  const S = Math.min(bw, MAX)
  const geo = useMemo(() => {
    const pad = S < 440 ? 20 : 44
    return { S, cx: S / 2, cy: S / 2, r: Math.max(0, S / 2 - pad) }
  }, [S])
  const path = useMemo(() => {
    const p = findPath(tree, focusId)
    return p.length ? p : [tree]
  }, [tree, focusId])
  const focus = path[path.length - 1]
  const cells = useMemo(() => cellLayout(focus, geo.cx, geo.cy, geo.r), [focus, geo])
  const st = stats(focus)

  const go = (id: string) => {
    if (id === focusId || fly) return
    setHot(null)
    const inside = cells.find((c) => c.depth === 1 && c.id === id && !isLeaf(c.node))
    if (reduced || !geo.r) return setFocusId(id)
    if (inside) {
      setFly({ ...fitInto(inside.poly, geo.cx, geo.cy, geo.r), id })
      timer.current = setTimeout(() => {
        setFocusId(id)
        setFly(null)
      }, FLY)
      return
    }
    // Going out: start the outer level zoomed into the cell we were in.
    const at = path.findIndex((p) => p.id === id)
    const next = path[at + 1]
    const target = path[at]
    if (!target || !next) return setFocusId(id)
    const cell = cellLayout(target, geo.cx, geo.cy, geo.r).find((c) => c.depth === 1 && c.id === next.id)
    setFocusId(id)
    setFrom(cell ? fitInto(cell.poly, geo.cx, geo.cy, geo.r) : null)
  }

  const nameOf = (n: TreeNode) => (n.id.startsWith("s:") ? labels.site(n.name) : n.id.startsWith("t:") ? labels.tower(n.name) : labels.all)
  const kids = focus.children.filter((c) => stats(c).value > 0).sort((a, b) => stats(b).value - stats(a).value)
  const level = focus.id === "root" ? "sites" : focus.id.startsWith("s:") ? "towers" : "clients"
  const amount = (t: Pick) => (t === "al-corriente" ? st.paid : t === "por-vencer" ? st.dueValue : t === "atrasado" ? st.lateValue : st.suspendedValue)
  const count = (t: Pick) => (t === "al-corriente" ? st.clients - st.due - st.late - st.suspended - leavesFree(focus) : t === "por-vencer" ? st.due : t === "atrasado" ? st.late : st.suspended)

  return (
    <div className="grid gap-3">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5 text-xs">
        {path.map((p, i) => {
          const last = i === path.length - 1
          return (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-zinc-600">/</span>}
              <button type="button" onClick={() => go(p.id)} aria-current={last ? "location" : undefined} className={`min-h-8 rounded-full px-2.5 ${last ? "bg-white/10 text-zinc-50" : "text-zinc-300 underline decoration-white/20 underline-offset-4 hover:text-zinc-50"} focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none`}>
                {nameOf(p)}
              </button>
            </span>
          )
        })}
        <span className="ml-auto hidden text-zinc-500 sm:inline">{labels.hint}</span>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(250px,300px)]">
        <div ref={setBox} className="min-w-0">
          <Frame square height={(w) => Math.min(w, MAX)} label={label}>
            {(_, tip) => (
              <Scene
                key={focusId}
                cells={cells}
                geo={geo}
                st={st}
                margins={margins}
                labels={labels}
                tip={tip}
                hot={hot}
                only={only}
                camera={fly ?? from}
                flying={!!fly}
                bloom={!from}
                fadeOthers={fly?.id ?? null}
                onHot={setHot}
                onGo={go}
                onUp={() => path.length > 1 && go(path[path.length - 2].id)}
                nameOf={nameOf}
              />
            )}
          </Frame>
        </div>

        {/* The ledger. */}
        <div className="grid gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <div>
            <p className="text-[0.7rem] tracking-wide text-zinc-500 uppercase">{labels.monthly}</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">{pesos(st.value)}</p>
            <p className="mt-1 text-xs text-zinc-400">{labels.clientsLine(st.clients, pesos(st.clients ? st.value / st.clients : 0))}</p>
          </div>
          <div className="grid gap-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-zinc-300">{labels.month}</p>
              <p className="font-mono text-xs text-zinc-400 tabular-nums">{labels.paidShare(pct(paidShare(st)))}</p>
            </div>
            <div aria-hidden className="flex h-2 gap-[2px] overflow-hidden rounded-full">
              {DIAL.map((t) => {
                const v = t === "sin-cobro" ? st.value - st.owed : amount(t)
                return v > 0 ? <span key={t} style={{ flexGrow: v, background: DIAL_COLOR[t], opacity: only && only !== t ? 0.25 : 1 }} className="transition-opacity" /> : null
              })}
            </div>
            <div role="group" aria-label={labels.month} className="grid grid-cols-2 gap-1.5">
              {PICKS.map((t) => {
                const pressed = only === t
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setOnly(pressed ? null : t)}
                    className={`grid min-h-11 gap-0.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${pressed ? "border-white/35 bg-white/8" : "border-white/8 hover:border-white/20"}`}
                  >
                    <span className="flex items-center gap-1.5 text-[0.7rem] text-zinc-400">
                      <span aria-hidden className={`size-2 rounded-full ${t === "por-vencer" ? "border border-[#8193ab]" : ""}`} style={{ background: t === "por-vencer" ? "transparent" : DIAL_COLOR[t], boxShadow: pressed ? `0 0 8px ${DIAL_COLOR[t]}` : undefined }} />
                      {labels.tones[t]}
                    </span>
                    <span className="font-mono text-sm text-zinc-100 tabular-nums">
                      {pesos(amount(t))} <span className="text-[0.7rem] text-zinc-500">· {count(t)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-1.5">
            <p className="flex items-baseline justify-between gap-2 text-xs text-zinc-300">
              {labels.lists[level]}
              {level !== "clients" && <span className="text-[0.7rem] text-zinc-500">{labels.share}</span>}
            </p>
            <div role="group" aria-label={`${label}: ${labels.lists[level]}`} className="grid gap-1">
              {kids.slice(0, level === "clients" ? 8 : 12).map((c) => {
                const s = stats(c)
                const m = c.id.startsWith("s:") ? margins.get(c.id.slice(2)) : undefined
                const tone = m ? marginTone(m.margin) : "none"
                const share = st.value ? s.value / st.value : 0
                const paid = paidShare(s)
                const body = (
                  <>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-zinc-100">{isLeaf(c) ? c.place || c.plan || "—" : nameOf(c)}</span>
                      <span className="shrink-0 font-mono text-xs text-zinc-300 tabular-nums">{pesos(s.value)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${share * 100}%` }} />
                        <span className="absolute inset-y-0 left-0 rounded-full bg-[#3987e5]" style={{ width: `${share * (paid ?? 0) * 100}%` }} />
                      </span>
                      {isLeaf(c) ? (
                        <span className="text-[0.7rem] text-zinc-500">{c.tone in labels.tones ? labels.tones[c.tone as Pick] : ""}</span>
                      ) : (
                        <span className="w-9 text-right font-mono text-[0.7rem] text-zinc-500 tabular-nums">{pct(share)}</span>
                      )}
                      {m && tone !== "none" && (
                        <span className={`rounded-full px-1.5 py-px font-mono text-[0.65rem] tabular-nums ${tone === "good" ? "bg-[#3987e5]/20 text-[#9cc3f5]" : tone === "even" ? "bg-white/8 text-zinc-300" : "text-zinc-100"}`} style={tone === "loss" ? { background: `repeating-linear-gradient(45deg, ${HATCH}55 0 3px, transparent 3px 6px)` } : undefined}>
                          {labels.margin(pct(m.margin))}
                        </span>
                      )}
                    </span>
                  </>
                )
                return isLeaf(c) ? (
                  <div key={c.id} className="grid gap-1 rounded-xl px-2.5 py-1.5" onPointerEnter={() => setHot(c.id)} onPointerLeave={() => setHot(null)}>
                    {body}
                  </div>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go(c.id)}
                    onPointerEnter={() => setHot(c.id)}
                    onPointerLeave={() => setHot(null)}
                    onFocus={() => setHot(c.id)}
                    onBlur={() => setHot(null)}
                    className={`grid min-h-11 gap-1 rounded-xl px-2.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${hot === c.id ? "bg-white/6" : "hover:bg-white/4"}`}
                  >
                    {body}
                  </button>
                )
              })}
              {kids.length > (level === "clients" ? 8 : 12) && <p className="px-2.5 text-[0.7rem] text-zinc-500">{labels.more(kids.length - (level === "clients" ? 8 : 12))}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Clients that owe nothing this month (installed after the 15th and the like): not counted as paid. */
function leavesFree(n: TreeNode | Leaf): number {
  return isLeaf(n) ? (n.tone === "sin-cobro" ? 1 : 0) : n.children.reduce((a, c) => a + leavesFree(c), 0)
}

const FILL: Record<Tone, string> = { "al-corriente": "url(#rm-paid-1)", "por-vencer": "#111723", atrasado: "url(#rm-late)", suspendido: "url(#rm-susp)", "sin-cobro": "#191c22" }
/** Paid glass in three steps of one blue: the more a client pays a month, the lighter its cell. */
const PAID_STEPS = [
  { upTo: 450, stops: ["#3d5a83", "#26395a", "#1a2840"] },
  { upTo: 700, stops: ["#5079ad", "#30497a", "#203458"] },
  { upTo: Infinity, stops: ["#6c98d3", "#3c5e98", "#27426f"] },
] as const
const paidFill = (v: number) => `url(#rm-paid-${PAID_STEPS.findIndex((s) => v <= s.upTo) + 1})`

function Scene({
  cells,
  geo,
  st,
  margins,
  labels,
  tip,
  hot,
  only,
  camera,
  flying,
  bloom,
  fadeOthers,
  onHot,
  onGo,
  onUp,
  nameOf,
}: {
  cells: Cell[]
  geo: { S: number; cx: number; cy: number; r: number }
  st: ReturnType<typeof stats>
  margins: Map<string, Margin>
  labels: RevenueLabels
  tip: Tip
  hot: string | null
  only: Pick | null
  camera: Fit | null
  flying: boolean
  bloom: boolean
  fadeOthers: string | null
  onHot: (id: string | null) => void
  onGo: (id: string) => void
  onUp: () => void
  nameOf: (n: TreeNode) => string
}) {
  const { S, cx, cy, r } = geo
  const wide = S >= 440
  const leaves = cells.filter((c) => isLeaf(c.node))
  const groups = cells.filter((c) => !isLeaf(c.node))
  const maxDepth = Math.max(1, ...cells.map((c) => c.depth))
  const lit = (c: Cell) => hot === null || c.top === hot || c.id === hot
  // The dial: this month's money around the circle, from 12 o'clock.
  const dialTotal = st.value || 1
  const parts = DIAL.map((t) => ({ t, v: t === "sin-cobro" ? st.value - st.owed : t === "al-corriente" ? st.paid : t === "por-vencer" ? st.dueValue : t === "atrasado" ? st.lateValue : st.suspendedValue })).filter((p) => p.v > 0)
  const ends = parts.map((_, i) => parts.slice(0, i + 1).reduce((a, p) => a + p.v, 0))
  const arcs = parts.map((p, i) => ({ ...p, a0: ((ends[i] - p.v) / dialTotal) * 2 * Math.PI, a1: (ends[i] / dialTotal) * 2 * Math.PI }))
  const ring = arc<{ a0: number; a1: number }>().innerRadius(r + (wide ? 9 : 6)).outerRadius(r + (wide ? 15 : 10)).startAngle((d) => d.a0).endAngle((d) => d.a1).padAngle(0.012).cornerRadius(2)
  const paidEnd = arcs.find((a) => a.t === "al-corriente")?.a1
  const groupTip = (c: Cell) => {
    const n = c.node as TreeNode
    const s = stats(n)
    const m = n.id.startsWith("s:") ? margins.get(n.id.slice(2)) : undefined
    return (
      <TipBody
        title={nameOf(n)}
        rows={[
          { label: labels.rows.monthly, value: pesos(s.value) },
          { label: labels.rows.paid, value: pct(paidShare(s)) },
          { label: labels.rows.clients, value: String(s.clients) },
          ...(s.late ? [{ label: labels.rows.late, value: String(s.late), color: TILE_COLOR.late }] : []),
          ...(s.suspended ? [{ label: labels.rows.suspended, value: String(s.suspended), color: TILE_COLOR.suspended }] : []),
          ...(m && m.margin !== null ? [{ label: labels.rows.margin, value: `${pct(m.margin)}${m.incomplete ? ` · ${labels.rows.incomplete}` : ""}`, color: marginTone(m.margin) === "loss" ? HATCH : MARGIN_COLOR[marginTone(m.margin)] }, { label: labels.rows.profit, value: pesos(m.profit) }] : []),
        ]}
      />
    )
  }
  const width = (c: Cell) => {
    const xs = c.poly.map((p) => p[0])
    return Math.max(...xs) - Math.min(...xs)
  }
  const far = Math.hypot(r, r) || 1
  // Label boxes placed so far this render (collision check for the pills).
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  return (
    <g>
      <defs>
        {PAID_STEPS.map((s, i) => (
          <radialGradient key={i} id={`rm-paid-${i + 1}`} cx="45%" cy="40%" r="75%">
            <stop offset="0%" stopColor={s.stops[0]} />
            <stop offset="60%" stopColor={s.stops[1]} />
            <stop offset="100%" stopColor={s.stops[2]} />
          </radialGradient>
        ))}
        <radialGradient id="rm-late" cx="45%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#f7b391" />
          <stop offset="100%" stopColor="#d9683d" />
        </radialGradient>
        <radialGradient id="rm-susp" cx="45%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#f07777" />
          <stop offset="100%" stopColor="#b52d2d" />
        </radialGradient>
        <radialGradient id="rm-halo" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#3987e5" stopOpacity={0.16} />
          <stop offset="100%" stopColor="#3987e5" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="rm-sheen" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0.35" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity={0.07} />
          <stop offset="0.65" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <pattern id="rm-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#2a2a28" />
          <rect width="3" height="6" fill={HATCH} />
        </pattern>
        <filter id="rm-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <clipPath id="rm-clip">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      {/* Outside the circle: a click goes one level up. */}
      <rect x={0} y={0} width={S} height={S} fill="transparent" onClick={onUp} />
      <circle cx={cx} cy={cy} r={r + (wide ? 40 : 18)} fill="url(#rm-halo)" pointerEvents="none" />

      {/* The dial. */}
      <g pointerEvents="none" className="t2-fade">
        <circle cx={cx} cy={cy} r={r + (wide ? 12 : 8)} fill="none" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={wide ? 6 : 4} />
        {arcs.map((a) => (
          <path key={a.t} d={ring(a) ?? ""} transform={`translate(${cx},${cy})`} fill={DIAL_COLOR[a.t]} opacity={only && only !== a.t ? 0.25 : 1} />
        ))}
        {wide &&
          Array.from({ length: 40 }, (_, i) => {
            const ang = (i / 40) * 2 * Math.PI
            const r0 = r + 19
            const r1 = r + (i % 4 === 0 ? 25 : 22)
            return <line key={i} x1={cx + r0 * Math.sin(ang)} y1={cy - r0 * Math.cos(ang)} x2={cx + r1 * Math.sin(ang)} y2={cy - r1 * Math.cos(ang)} stroke={INK.muted} strokeOpacity={i % 4 === 0 ? 0.6 : 0.3} />
          })}
        {wide && paidEnd !== undefined && paidEnd > 0.3 && paidEnd < 2 * Math.PI - 0.05 && (
          <text x={cx + (r + 34) * Math.sin(paidEnd)} y={cy - (r + 34) * Math.cos(paidEnd)} textAnchor={Math.sin(paidEnd) >= 0 ? "start" : "end"} dy="0.35em" fontSize={10.5} fill={INK.secondary} className="font-mono tabular-nums">
            {labels.paidShare(pct(paidShare(st)))}
          </text>
        )}
      </g>

      {/* The glass, clipped to the circle; the camera moves this group. */}
      <g clipPath="url(#rm-clip)">
        <g style={{ transform: camera ? `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})` : "none", transformOrigin: "0 0", transition: camera && !flying ? "none" : `transform ${FLY}ms cubic-bezier(.6,0,.2,1)` }}>
          <circle cx={cx} cy={cy} r={r} fill="#0b0f16" />
          {leaves.map((c) => {
            const leaf = c.node as Leaf
            const pick = only === null || leaf.tone === only
            const away = fadeOthers !== null && c.top !== fadeOthers
            const d = Math.hypot(c.c[0] - cx, c.c[1] - cy) / far
            return (
              <path
                key={c.id}
                d={polyPath(c.poly)}
                fill={leaf.tone === "al-corriente" ? paidFill(leaf.value) : FILL[leaf.tone]}
                stroke={leaf.tone === "por-vencer" ? "#5b6b82" : INK.surface}
                strokeWidth={leaf.tone === "por-vencer" ? 1 : 1.4}
                opacity={away ? 0 : !pick ? 0.12 : lit(c) ? 1 : 0.5}
                                className={bloom ? "rm-bloom" : undefined}
                style={{ animationDelay: `${Math.round(60 + d * 650)}ms`, transition: `opacity ${flying ? FLY * 0.6 : 200}ms`, filter: leaf.tone === "suspendido" && pick ? "drop-shadow(0 0 5px rgba(208,59,59,.7))" : undefined }}
                onPointerMove={(e) => {
                  onHot(c.top)
                  const info = labels.leafTip(leaf)
                  tip.show(e, <TipBody title={info.title} rows={info.rows} />)
                }}
                onPointerLeave={() => {
                  onHot(null)
                  tip.hide()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (c.top !== c.id) onGo(c.top)
                }}
                cursor={c.top !== c.id ? "zoom-in" : undefined}
              />
            )
          })}
          {/* A slow light across the glass (still under reduced motion). */}
          <rect x={cx - r * 2} y={cy - r * 2} width={r * 4} height={r * 4} fill="url(#rm-sheen)" className="t2-spin" pointerEvents="none" />
          {/* Lead lines: towers fine, deployments lit (dashed hatch gray when they lose money). */}
          <g pointerEvents="none" className={bloom ? "t2-fade" : undefined} style={{ animationDelay: "550ms" }}>
            {groups
              .filter((c) => c.depth > 1 || maxDepth === 1)
              .map((c) => (
                <path key={c.id} d={polyPath(c.poly)} fill="none" stroke="#dbe7ff" strokeOpacity={fadeOthers && c.top !== fadeOthers ? 0 : lit(c) ? 0.32 : 0.12} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
              ))}
            {groups
              .filter((c) => c.depth === 1)
              .map((c) => {
                const m = c.id.startsWith("s:") ? margins.get(c.id.slice(2)) : undefined
                const loss = m ? marginTone(m.margin) === "loss" : false
                const on = hot === c.id
                const gone = fadeOthers !== null && c.id !== fadeOthers
                return (
                  <g key={c.id} opacity={gone ? 0 : 1} style={{ transition: "opacity 300ms" }}>
                    <path d={polyPath(c.poly)} fill="none" stroke={loss ? HATCH : "#8fbaff"} strokeOpacity={on ? 0.55 : 0.22} strokeWidth={on ? 7 : 5} filter="url(#rm-glow)" vectorEffect="non-scaling-stroke" />
                    <path d={polyPath(c.poly)} fill="none" stroke={loss ? HATCH : "#e3edff"} strokeOpacity={on ? 1 : lit(c) ? 0.78 : 0.35} strokeWidth={on ? 2.4 : 1.7} strokeDasharray={loss ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />
                  </g>
                )
              })}
          </g>
          <circle cx={cx} cy={cy} r={r - 0.5} fill="none" stroke="#e3edff" strokeOpacity={0.35} strokeWidth={1.2} pointerEvents="none" />
        </g>
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#8fbaff" strokeOpacity={0.3} strokeWidth={4} filter="url(#rm-glow)" pointerEvents="none" />

      {/* Labels: a pill on each group big enough; clients named when their cell can hold it. */}
      {!camera && (
        <g className="t2-fade" style={{ animationDelay: bloom ? "700ms" : "450ms" }}>
          {groups
            .filter((c) => c.depth === 1)
            .sort((a, b) => b.area - a.area)
            .map((c) => {
              const n = c.node as TreeNode
              const name = nameOf(n)
              const money = pesos(stats(n).value)
              const m = n.id.startsWith("s:") ? margins.get(n.id.slice(2)) : undefined
              const tone = m ? marginTone(m.margin) : "none"
              const cw = width(c)
              const fs = wide ? 1 : 0.9
              const chars = Math.max(4, Math.min(name.length, Math.floor((cw * 0.82 - 22) / (6.6 * fs))))
              const pw = (Math.max(chars * 6.6, money.length * 6.8 + (tone !== "none" ? 16 : 0)) + 22) * fs
              const ph = 36 * fs
              if (pw > cw * 0.92 || c.area < pw * ph * 1.6) return null
              const [x, y] = c.c
              // Largest cells first; a pill that would cover one already placed stays out (its row is in the list).
              const box = { x0: x - pw / 2 - 4, x1: x + pw / 2 + 4, y0: y - ph / 2 - 4, y1: y + ph / 2 + 4 }
              if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) return null
              placed.push(box)
              return (
                <g
                  key={c.id}
                  transform={`translate(${x - pw / 2},${y - ph / 2})`}
                  style={{ cursor: "zoom-in" }}
                  onPointerMove={(e) => {
                    onHot(c.id)
                    tip.show(e, groupTip(c))
                  }}
                  onPointerLeave={() => {
                    onHot(null)
                    tip.hide()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onGo(c.id)
                  }}
                >
                  <rect width={pw} height={ph} rx={10} fill="#0c1018" fillOpacity={0.82} stroke="#ffffff" strokeOpacity={hot === c.id ? 0.4 : 0.14} />
                  <g transform={`scale(${fs})`}>
                    <text x={11} y={15} fontSize={11.5} fontWeight={500} fill={INK.primary}>
                      {clipName(name, chars)}
                    </text>
                    <text x={11} y={29} fontSize={10.5} fill={INK.secondary} className="font-mono tabular-nums">
                      {money}
                    </text>
                    {tone !== "none" && <circle cx={pw / fs - 13} cy={25} r={4} fill={MARGIN_COLOR[tone]} stroke={tone === "loss" ? HATCH : "none"} />}
                  </g>
                </g>
              )
            })}
          {leaves
            .filter((c) => c.depth === 1)
            .map((c) => {
              const leaf = c.node as Leaf
              const cw = width(c)
              const title = leaf.place || leaf.plan
              if (!title || cw < 64 || c.area < 2600) return null
              const loud = leaf.tone === "atrasado" || leaf.tone === "suspendido"
              const chars = Math.floor((cw * 0.8) / 6.4)
              return (
                <g key={c.id} pointerEvents="none" textAnchor="middle">
                  <text x={c.c[0]} y={c.c[1] - 2} fontSize={11} fontWeight={500} fill={loud ? "#140c0a" : INK.primary}>
                    {clipName(title, chars)}
                  </text>
                  <text x={c.c[0]} y={c.c[1] + 12} fontSize={10} fill={loud ? "#2a1610" : INK.secondary} className="font-mono tabular-nums">
                    {pesos(leaf.value)}
                  </text>
                </g>
              )
            })}
        </g>
      )}
    </g>
  )
}
