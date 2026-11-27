"use client"

import { useMemo, useState } from "react"
import { liveLayout, NO_LINK, type LiveHub, type LiveLayout, type LiveNet, type LiveSite, type SiteState, type Strand } from "@/lib/interno/tablero2-live"
import { useReducedMotion } from "@/lib/motion"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { clipName, pct } from "./format"

/** Strand and ring colors. Calm blue for a healthy network; status colors only where something needs a look. */
export const LIVE_COLOR = {
  flow: "#5598e7",
  flowCore: "#9ec5f4",
  base: "#1d2c40",
  track: "#18202c",
  online: "#5598e7",
  full: STATUS.warning,
  saturated: STATUS.critical,
  outage: STATUS.critical,
  silent: STATUS.serious,
  justo: STATUS.warning,
  bad: STATUS.critical,
  nodata: "#3a3a38",
} as const

const ALERT: SiteState[] = ["outage", "silent", "saturated", "full"]
const flowColor = (s: SiteState) => (s === "saturated" || s === "outage" ? LIVE_COLOR.saturated : s === "full" ? LIVE_COLOR.full : LIVE_COLOR.flow)

export type LiveLabels = {
  mbps: (n: number) => string
  ms: (n: number) => string
  state: (s: SiteState) => string
  noLink: string
  noName: string
  noTower: string
  rows: { online: string; traffic: string; use: string; latency: string; loss: string; light: string; links: string; towers: string; state: string; capacity: string; sites: string }
  lightProblems: (justo: number, bad: number) => string
}

/**
 * La red viva: the carriers in the middle, a fiber strand per internet link out to each deployment. A strand's width is
 * the link's speed; its lit length is how full the deployment's links are right now, and light travels along it faster
 * the fuller it is (none under reduced motion). Each deployment is a ring split by tower, lit by the share of its
 * clients online; dots outside the ring are ONTs with weak or bad light. Calm blue by default: amber from 80 %, red
 * from 95 % or when a router fails or goes silent. Hover (or tap) a deployment or a carrier: the rest steps back.
 */
export function LiveNetwork({ net, label, labels, selected, onSelect }: { net: LiveNet; label: string; labels: LiveLabels; selected: string | null; onSelect: (id: string | null) => void }) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<{ kind: "site" | "hub"; id: string } | null>(null)
  const focus = hover ?? (selected ? { kind: "site" as const, id: selected } : null)
  return (
    <Frame square height={(w) => Math.min(w, 620)} label={label}>
      {(size, tip) => <Scene size={size} net={net} reduced={reduced} focus={focus} setHover={setHover} onSelect={onSelect} tip={tip} labels={labels} />}
    </Frame>
  )
}

type Focus = { kind: "site" | "hub"; id: string } | null

function Scene({ size, net, reduced, focus, setHover, onSelect, tip, labels }: { size: number; net: LiveNet; reduced: boolean; focus: Focus; setHover: (f: Focus) => void; onSelect: (id: string | null) => void; tip: Tip; labels: LiveLabels }) {
  const lay = useMemo(() => liveLayout(net, size), [net, size])
  const k = size / 600
  const sites = new Map(net.sites.map((s) => [s.id, s]))
  const hubs = new Map(net.hubs.map((h) => [h.key, h]))
  const lit = (s: Strand) => !focus || (focus.kind === "site" ? s.siteId === focus.id : s.hub === focus.id)
  const siteLit = (id: string) => !focus || (focus.kind === "site" ? focus.id === id : (hubs.get(focus.id)?.sites.includes(id) ?? false))
  const hubLit = (key: string) => !focus || (focus.kind === "hub" ? focus.id === key : lay.strands.some((s) => s.hub === key && s.siteId === focus.id))

  const siteTip = (s: LiveSite) => (
    <TipBody
      title={s.name}
      rows={[
        { label: labels.rows.state, value: labels.state(s.state) },
        { label: labels.rows.online, value: s.online === null ? `— / ${s.live}` : `${s.online} / ${s.live}` },
        { label: labels.rows.traffic, value: s.use === null ? "—" : `${labels.mbps(s.use)}${s.capacity ? ` / ${labels.mbps(s.capacity)}` : ""}` },
        { label: labels.rows.use, value: pct(s.share) },
        { label: labels.rows.latency, value: s.rtt === null ? "—" : labels.ms(s.rtt) },
        ...(s.loss ? [{ label: labels.rows.loss, value: pct(s.loss, 1) }] : []),
        ...(s.justo + s.baja + s.satura ? [{ label: labels.rows.light, value: labels.lightProblems(s.justo, s.baja + s.satura) }] : []),
        { label: labels.rows.links, value: s.links.map((l) => `${l.carrier || labels.noName}${l.down ? ` ${labels.mbps(l.down)}` : ""}`).join(" · ") || labels.noLink },
        ...(s.towers.length > 1 ? [{ label: labels.rows.towers, value: s.towers.map((t) => `${t.name || labels.noTower} ${t.online ?? "—"}/${t.live}`).join(" · ") }] : []),
      ]}
    />
  )
  const hubTip = (h: LiveHub) => (
    <TipBody
      title={h.key === NO_LINK ? labels.noLink : h.name || labels.noName}
      rows={[
        { label: labels.rows.sites, value: String(h.sites.length) },
        ...(h.capacity ? [{ label: labels.rows.capacity, value: labels.mbps(h.capacity) }] : []),
        ...(h.rtt !== null ? [{ label: labels.rows.latency, value: labels.ms(h.rtt) }] : []),
        ...(h.loss ? [{ label: labels.rows.loss, value: pct(h.loss, 1) }] : []),
      ]}
    />
  )

  return (
    <g>
      <defs>
        <radialGradient id="lv-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3987e5" stopOpacity="0.16" />
          <stop offset="55%" stopColor="#3987e5" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#3987e5" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lv-disc" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#14223a" />
          <stop offset="100%" stopColor="#0a0f18" />
        </radialGradient>
        <filter id="lv-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={2.2 * Math.max(0.7, k)} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* The instrument: a soft core light, guide rings and ticks. */}
      <circle cx={lay.c} cy={lay.c} r={lay.c * 0.62} fill="url(#lv-core)" />
      {!reduced && lay.rings.length > 0 && <Sweep c={lay.c} r={lay.rings[lay.rings.length - 1]} />}
      {lay.rings.map((r, i) => (
        <circle key={r} cx={lay.c} cy={lay.c} r={r} fill="none" stroke="#ffffff" strokeOpacity={i === lay.rings.length - 1 ? 0.06 : 0.035} strokeDasharray={i === lay.rings.length - 1 ? "1 6" : undefined} />
      ))}
      <Ticks lay={lay} />

      {/* Strands: casing, dim fiber, the lit share, the travelling light. */}
      <g fill="none" strokeLinecap="round">
        {lay.strands.map((st) => {
          const s = sites.get(st.siteId)!
          const link = s.links.find((l) => l.id === st.id)
          const dead = s.state === "outage" || s.state === "silent" || link?.state === "down"
          const on = lit(st)
          const share = s.share ?? 0
          return (
            <g key={st.id} style={{ opacity: on ? 1 : 0.1, transition: "opacity .25s" }}>
              <path d={st.d} stroke={INK.surface} strokeWidth={st.width + 3} />
              <path d={st.d} stroke={dead ? "#3a2222" : link?.state === "nodata" || !link ? LIVE_COLOR.nodata : LIVE_COLOR.base} strokeWidth={st.width} strokeDasharray={dead || !link ? "2 5" : link.state === "lossy" ? "6 3" : undefined} />
              {!dead && s.share !== null && share > 0 && (
                <path d={st.d} pathLength={100} stroke={flowColor(s.state)} strokeOpacity={0.9} strokeWidth={Math.max(1, st.width - 1)} strokeDasharray={`${Math.min(100, share * 100)} 100`} style={{ transition: reduced ? undefined : "stroke-dasharray 1.2s cubic-bezier(.22,.8,.3,1)" }} />
              )}
              {!dead && !reduced && s.use !== null && s.use > 0 && <Photons st={st} share={share} color={s.state === "ok" ? LIVE_COLOR.flowCore : flowColor(s.state)} k={k} />}
            </g>
          )
        })}
      </g>

      {/* Carriers: each label on the side away from the other carriers (below when there is one). */}
      {lay.hubs.map((hp) => {
        const mx = lay.hubs.reduce((a, x) => a + x.x, 0) / lay.hubs.length
        const my = lay.hubs.reduce((a, x) => a + x.y, 0) / lay.hubs.length
        const dx = hp.x - mx
        const dy = hp.y - my
        const len = Math.hypot(dx, dy)
        const [ux, uy] = len > 4 ? [dx / len, dy / len] : [0, 1]
        const away = hp.r + 17 * Math.max(0.8, k)
        const h = hubs.get(hp.key)!
        const none = h.key === NO_LINK
        const trouble = h.state === "down" || h.state === "lossy"
        const name = none ? labels.noLink : h.name || labels.noName
        const initials = none ? "—" : (name.match(/\b\p{L}/gu) ?? [name[0] ?? "?"]).slice(0, 2).join("").toUpperCase()
        return (
          <g key={hp.key} style={{ opacity: hubLit(hp.key) ? 1 : 0.3, transition: "opacity .25s", cursor: "default" }}
            onPointerMove={(e) => { setHover({ kind: "hub", id: hp.key }); tip.show(e, hubTip(h)) }}
            onPointerLeave={() => { setHover(null); tip.hide() }}
          >
            {!reduced && !none && <circle cx={hp.x} cy={hp.y} r={hp.r + 7 * Math.max(0.7, k)} fill="none" stroke={trouble ? STATUS.warning : "#3987e5"} strokeOpacity={0.45} strokeDasharray="2 6" className="t2-spin" />}
            <circle cx={hp.x} cy={hp.y} r={hp.r} fill="#0c1422" stroke={none ? INK.axis : trouble ? STATUS.warning : "#3987e5"} strokeWidth={1.5} strokeDasharray={none ? "3 3" : undefined} />
            <circle cx={hp.x} cy={hp.y} r={hp.r * 0.62} fill="#3987e5" fillOpacity={none ? 0 : 0.12} />
            <text x={hp.x} y={hp.y} dy="0.35em" textAnchor="middle" fill={INK.primary} fontSize={11 * Math.max(0.8, k)} fontWeight={600} letterSpacing="0.04em">
              {initials}
            </text>
            <HubLabel x={hp.x + ux * away * (Math.abs(ux) > 0.6 ? (k < 0.8 ? 1.25 : 1.7) : 1)} y={hp.y + uy * away} name={clipName(name, k < 0.8 ? 11 : 16)} rtt={h.rtt === null || k < 0.8 ? "" : labels.ms(h.rtt)} fs={10.5 * Math.max(0.85, k)} />
          </g>
        )
      })}

      {/* Deployments. */}
      {lay.sites.map((sp) => {
        const s = sites.get(sp.id)!
        const alert = ALERT.includes(s.state)
        const hard = s.state === "outage" || s.state === "silent" || s.state === "saturated"
        const ringW = Math.max(3, sp.r * 0.2)
        const ringR = sp.r - ringW / 2 - 1
        const fs = Math.max(9.5, 11 * Math.max(0.85, k))
        const name = clipName(s.name, 20)
        const reading = s.use === null ? labels.state(s.state) : `${labels.mbps(s.use)}${s.share !== null ? ` · ${pct(s.share)}` : ""}`
        // Above the node in the upper half, below it in the lower half; never past the frame's sides.
        const up = sp.y < lay.c - sp.r
        const half = Math.max(name.length * fs * 0.29, reading.length * fs * 0.3) + 4
        const lx = Math.max(half, Math.min(lay.size - half, sp.x))
        const ly = up ? sp.y - sp.r - 10 * Math.max(0.8, k) - fs * 1.25 : sp.y + sp.r + 8 * Math.max(0.8, k) + fs
        return (
          <g key={sp.id} style={{ opacity: siteLit(sp.id) ? 1 : 0.28, transition: "opacity .25s", cursor: "pointer" }}
            onPointerMove={(e) => { setHover({ kind: "site", id: sp.id }); tip.show(e, siteTip(s)) }}
            onPointerLeave={() => { setHover(null); tip.hide() }}
            onClick={() => onSelect(sp.id)}
          >
            {alert && <circle cx={sp.x} cy={sp.y} r={sp.r + 4} fill="none" stroke={s.state === "full" ? LIVE_COLOR.full : LIVE_COLOR.outage} strokeWidth={1.5} className={reduced ? undefined : "t2-ping"} />}
            {hard && <circle cx={sp.x} cy={sp.y} r={sp.r + 4} fill="none" stroke={LIVE_COLOR.outage} strokeOpacity={0.6} strokeWidth={2} filter="url(#lv-glow)" />}
            <circle cx={sp.x} cy={sp.y} r={sp.r} fill="url(#lv-disc)" stroke="#ffffff" strokeOpacity={0.08} />
            <TowerRing s={s} cx={sp.x} cy={sp.y} r={ringR} w={ringW} />
            <LightDots s={s} cx={sp.x} cy={sp.y} r={sp.r + 4.5 * Math.max(0.8, k)} k={k} toward={sp.angle + Math.PI} />
            <text x={sp.x} y={sp.y} dy={s.online === null ? "0.35em" : "0.1em"} textAnchor="middle" fill={INK.primary} fontSize={Math.max(10, sp.r * 0.5)} className="font-mono tabular-nums" fontWeight={500}>
              {s.online ?? s.live}
            </text>
            {s.online !== null && sp.r >= 20 && (
              <text x={sp.x} y={sp.y + Math.max(9, sp.r * 0.38)} textAnchor="middle" fill={INK.muted} fontSize={Math.max(8, sp.r * 0.22)} className="font-mono">
                /{s.live}
              </text>
            )}
            <g style={{ paintOrder: "stroke" }} stroke={INK.surface} strokeWidth={3} strokeLinejoin="round">
              <text x={lx} y={ly} textAnchor="middle" fill={INK.secondary} fontSize={fs}>
                {name}
              </text>
              <text x={lx} y={ly + fs * 1.25} textAnchor="middle" fill={alert ? INK.primary : INK.muted} fontSize={fs * 0.88} className="font-mono tabular-nums">
                {reading}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** A carrier's name (and latency) on a small dark pill, so strands passing behind never cut through it. */
function HubLabel({ x, y, name, rtt, fs }: { x: number; y: number; name: string; rtt: string; fs: number }) {
  const w = (name.length + (rtt ? rtt.length + 3 : 0)) * fs * 0.56 + 14
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y - fs * 0.95} width={w} height={fs * 1.7} rx={fs * 0.85} fill={INK.surface} fillOpacity={0.92} stroke="#ffffff" strokeOpacity={0.08} />
      <text x={x} y={y} dy="0.05em" textAnchor="middle" fill={INK.secondary} fontSize={fs}>
        {name}
        {rtt && <tspan fill={INK.muted} className="font-mono">{` · ${rtt}`}</tspan>}
      </text>
    </g>
  )
}

/** A faint radar sweep turning once every 9 s: a wedge that fades behind its leading edge. */
function Sweep({ c, r }: { c: number; r: number }) {
  const a = Math.PI / 5
  const p = (t: number) => `${(c + r * Math.cos(t)).toFixed(1)},${(c + r * Math.sin(t)).toFixed(1)}`
  return (
    <g className="t2-sweep" style={{ transformOrigin: `${c}px ${c}px` }} pointerEvents="none">
      <defs>
        <linearGradient id="lv-sweep" gradientUnits="userSpaceOnUse" x1={c + r * Math.cos(-a)} y1={c + r * Math.sin(-a)} x2={c + r} y2={c}>
          <stop offset="0%" stopColor="#5598e7" stopOpacity="0" />
          <stop offset="100%" stopColor="#5598e7" stopOpacity="0.09" />
        </linearGradient>
      </defs>
      <path d={`M${c},${c}L${p(-a)}A${r},${r} 0 0 1 ${p(0)}Z`} fill="url(#lv-sweep)" />
      <line x1={c} y1={c} x2={c + r} y2={c} stroke="#5598e7" strokeOpacity={0.18} />
    </g>
  )
}

/** Hairline ticks around the outer guide ring every 7.5°, longer every 45°: the instrument's bezel. */
function Ticks({ lay }: { lay: LiveLayout }) {
  const r = lay.rings[lay.rings.length - 1] ?? 0
  if (!r) return null
  const d = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2
    const len = i % 6 === 0 ? 7 : 3
    const x1 = lay.c + (r - len / 2) * Math.cos(a)
    const y1 = lay.c + (r - len / 2) * Math.sin(a)
    const x2 = lay.c + (r + len / 2) * Math.cos(a)
    const y2 = lay.c + (r + len / 2) * Math.sin(a)
    return `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`
  }).join("")
  return <path d={d} stroke="#ffffff" strokeOpacity={0.09} strokeWidth={1} />
}

/** Light travelling a strand: more and faster the fuller the link (download runs carrier → deployment). */
function Photons({ st, share, color, k }: { st: Strand; share: number; color: string; k: number }) {
  const n = Math.max(1, Math.min(6, Math.round(1 + share * 5)))
  const speed = (45 + 210 * Math.min(1, share)) * Math.max(0.7, k)
  const dur = Math.max(0.9, st.length / speed)
  const r = Math.max(1.2, Math.min(2.4, st.width * 0.38))
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <circle r={r * 2.6} fill={color} fillOpacity={0.16}>
            <animateMotion dur={`${dur.toFixed(2)}s`} begin={`${(-(i * dur) / n).toFixed(2)}s`} repeatCount="indefinite" path={st.d} />
          </circle>
          <circle r={r} fill={color}>
            <animateMotion dur={`${dur.toFixed(2)}s`} begin={`${(-(i * dur) / n).toFixed(2)}s`} repeatCount="indefinite" path={st.d} />
          </circle>
        </g>
      ))}
    </g>
  )
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  if (a1 - a0 >= Math.PI * 2 - 1e-3) return `M${p(a0)}A${r},${r} 0 1 1 ${p(a0 + Math.PI)}A${r},${r} 0 1 1 ${p(a0)}`
  return `M${p(a0)}A${r},${r} 0 ${large} 1 ${p(a1)}`
}

/** The deployment's ring: one segment per tower (by its clients), lit by the share of them online. */
function TowerRing({ s, cx, cy, r, w }: { s: LiveSite; cx: number; cy: number; r: number; w: number }) {
  const towers = s.towers.filter((t) => t.live > 0)
  const list = towers.length ? towers : [{ id: "", name: "", live: 1, online: null, justo: 0, baja: 0, satura: 0 }]
  const total = list.reduce((a, t) => a + t.live, 0)
  const gap = list.length > 1 ? 0.12 : 0
  const spans = list.map((t) => (t.live / total) * Math.PI * 2)
  const starts = spans.map((_, i) => -Math.PI / 2 + spans.slice(0, i).reduce((x, y) => x + y, 0))
  return (
    <g fill="none" strokeLinecap="butt">
      {list.map((t, i) => {
        const span = spans[i] - gap
        const a0 = starts[i] + gap / 2
        const share = t.online === null ? null : t.online / Math.max(1, t.live)
        return (
          <g key={t.id || "none"}>
            <path d={arc(cx, cy, r, a0, a0 + span)} stroke={LIVE_COLOR.track} strokeWidth={w} />
            {share !== null && share > 0 && <path d={arc(cx, cy, r, a0, a0 + span * share)} stroke={LIVE_COLOR.online} strokeWidth={w} strokeOpacity={0.9} />}
          </g>
        )
      })}
    </g>
  )
}

/** One dot per ONT with a light problem, just outside the ring: amber when tight, red when too low or too high. */
function LightDots({ s, cx, cy, r, k, toward }: { s: LiveSite; cx: number; cy: number; r: number; k: number; toward: number }) {
  const dots = [...Array(s.baja + s.satura).fill(LIVE_COLOR.bad), ...Array(s.justo).fill(LIVE_COLOR.justo)].slice(0, 16) as string[]
  if (!dots.length) return null
  const step = Math.min(0.32, (Math.PI * 1.2) / dots.length)
  return (
    <g>
      {dots.map((c, i) => {
        const a = toward + (i - (dots.length - 1) / 2) * step
        return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={Math.max(1.6, 2.2 * k)} fill={c} />
      })}
    </g>
  )
}
