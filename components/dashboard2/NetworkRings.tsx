"use client"

import { useMemo, useState } from "react"
import { ringLayout, TONES, type RingGroup, type Tone } from "@/lib/interno/tablero2"
import { useReducedMotion } from "@/lib/motion"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { clipName } from "./format"

/** How each client stands (Cobranza): status colors, never reused for anything else here. */
export const TONE_COLOR: Record<Tone, string> = { "al-corriente": STATUS.good, "por-vencer": STATUS.warning, atrasado: STATUS.serious, suspendido: STATUS.critical, "sin-cobro": INK.muted }


/**
 * The living network: the core in the middle, a spoke to every deployment, and each deployment a sunflower of its
 * clients (one dot each, the calm ones in the middle, the late and suspended on the rim). Light runs down the spokes
 * (decoration, none under reduced motion). Hover a deployment to see how its clients stand; the others dim.
 */
export function NetworkRings({ groups, label, center, centerHint, name, toneLabel }: { groups: RingGroup[]; label: string; center: string; centerHint: string; name: (g: RingGroup) => string; toneLabel: (t: Tone) => string }) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<number | null>(null)
  return (
    <Frame square height={(w) => Math.min(w, 560)} label={label}>
      {(size, tip) => <Rings size={size} groups={groups} reduced={reduced} hover={hover} setHover={setHover} tip={tip} center={center} centerHint={centerHint} name={name} toneLabel={toneLabel} />}
    </Frame>
  )
}

function Rings({ size, groups, reduced, hover, setHover, tip, center, centerHint, name, toneLabel }: { size: number; groups: RingGroup[]; reduced: boolean; hover: number | null; setHover: (i: number | null) => void; tip: Tip; center: string; centerHint: string; name: (g: RingGroup) => string; toneLabel: (t: Tone) => string }) {
  const L = useMemo(() => ringLayout(groups.map((g) => g.clients.length), size), [groups, size])
  const c = size / 2
  const R = L.discs.length ? Math.hypot(L.discs[0].x - c, L.discs[0].y - c) : size / 3
  return (
    <g>
      <defs>
        <radialGradient id="t2-core">
          <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.55} />
          <stop offset="60%" stopColor={SERIES[0]} stopOpacity={0.12} />
          <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="t2-disc">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.015} />
        </radialGradient>
      </defs>
      {/* The orbit and two quiet guide rings. */}
      {[0.45, 0.72, 1].map((f) => (
        <circle key={f} cx={c} cy={c} r={R * f} fill="none" stroke={INK.grid} strokeWidth={1} strokeDasharray={f === 1 ? undefined : "2 4"} opacity={f === 1 ? 0.9 : 0.6} />
      ))}
      {L.discs.map((d, i) => {
        const g = groups[i]
        const ux = Math.cos(d.angle)
        const uy = Math.sin(d.angle)
        const x1 = c + ux * (L.core + 4)
        const y1 = c + uy * (L.core + 4)
        const x2 = d.x - ux * (d.r + 3)
        const y2 = d.y - uy * (d.r + 3)
        const dim = hover !== null && hover !== i
        const counts = TONES.map((t) => [t, g.clients.filter((x) => x.tone === t).length] as const).filter(([, n]) => n)
        return (
          <g key={g.id || "none"} opacity={dim ? 0.3 : 1} style={{ transition: "opacity 200ms" }}>
            <defs>
              <linearGradient id={`t2-spoke-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.9} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#t2-spoke-${i})`} strokeWidth={hover === i ? 2 : 1.25} strokeLinecap="round" />
            {!reduced &&
              [0, 1].map((p) => (
                <circle key={p} r={1.8} fill="#9ec5f4">
                  <animateMotion dur={`${2.6 + (i % 4) * 0.35}s`} begin={`${p * 1.3 + i * 0.21}s`} repeatCount="indefinite" path={`M${x1},${y1} L${x2},${y2}`} />
                  <animate attributeName="opacity" values="0;1;0" dur={`${2.6 + (i % 4) * 0.35}s`} begin={`${p * 1.3 + i * 0.21}s`} repeatCount="indefinite" />
                </circle>
              ))}
            <circle cx={d.x} cy={d.y} r={d.r} fill="url(#t2-disc)" stroke="rgba(255,255,255,0.09)" />
            {d.dots.map((p, j) => (
              <circle key={j} cx={p.x} cy={p.y} r={L.dot} fill={TONE_COLOR[g.clients[j].tone]} />
            ))}
            {/* The name under the disc, kept inside the square (about 6 px per character at 11 px). */}
            {(() => {
              const count = ` · ${g.clients.length}`
              const text = `${clipName(name(g), Math.floor(Math.max(90, Math.min(170, d.r * 2 + 40)) / 5.6) - count.length)}${count}`
              const half = (text.length * 6) / 2
              return (
                <text x={Math.min(size - half, Math.max(half, d.x))} y={d.y + d.r + 13} textAnchor="middle" fontSize={11} fill={hover === i ? INK.primary : INK.secondary} stroke={INK.surface} strokeWidth={3} paintOrder="stroke" className="pointer-events-none">
                  {text}
                </text>
              )
            })()}
            <circle
              cx={d.x}
              cy={d.y}
              r={d.r + 6}
              fill="transparent"
              onPointerMove={(e) => {
                setHover(i)
                tip.show(e, <TipBody title={`${name(g)} · ${g.clients.length}`} rows={counts.map(([t, n]) => ({ label: toneLabel(t), value: String(n), color: TONE_COLOR[t] }))} />)
              }}
              onPointerLeave={() => {
                setHover(null)
                tip.hide()
              }}
            />
          </g>
        )
      })}
      <circle cx={c} cy={c} r={L.core * 2.4} fill="url(#t2-core)" />
      <circle cx={c} cy={c} r={L.core} fill={INK.surface} stroke={SERIES[0]} strokeWidth={1.5} />
      {!reduced && (
        <circle cx={c} cy={c} r={L.core} fill="none" stroke={SERIES[0]} strokeWidth={1}>
          <animate attributeName="r" values={`${L.core};${L.core * 1.9}`} dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0" dur="3.2s" repeatCount="indefinite" />
        </circle>
      )}
      <text x={c} y={c + 2} textAnchor="middle" fontSize={Math.max(14, L.core * 0.62)} fontWeight={300} fill={INK.primary}>
        {center}
      </text>
      <text x={c} y={c + Math.max(14, L.core * 0.62) * 0.4 + 10} textAnchor="middle" fontSize={9} letterSpacing="0.08em" fill={INK.muted}>
        {centerHint}
      </text>
    </g>
  )
}
