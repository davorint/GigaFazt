"use client"

import { useId } from "react"
import { useReducedMotion } from "@/lib/motion"
import type { Glass } from "@/lib/interno/tablero2-net"
import { INK, SERIES, STATUS } from "@/components/dashboard/theme"

const W = 120
const H = 172
const NECK_MIN = 5

/** Busy-hour use of the links as a state: comfortable, getting tight, full. */
const sandColor = (use: number) => (use >= 0.8 ? STATUS.critical : use >= 0.6 ? STATUS.warning : STATUS.good)

/**
 * Speed of service as an hourglass per deployment: the top bulb is the speed sold (every active plan added up), the
 * neck is the carriers' links, the sand at the bottom is the busy hour filling those links. Widths are to scale across
 * deployments (the neck has a few pixels at least so it shows); a thin neck under a wide top is a high contention ratio.
 * Grains fall through the neck (decoration, none under reduced motion).
 */
export function SpeedHourglass({ glasses, lines }: { glasses: Glass[]; lines: (g: Glass) => { label: string; value: string; tone?: "warn" | "bad" }[] }) {
  const reduced = useReducedMotion()
  const id = useId().replace(/:/g, "")
  const max = Math.max(1, ...glasses.map((g) => Math.max(g.sold, g.link ?? 0)))
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {glasses.map((g, gi) => {
        const top = Math.max(NECK_MIN * 2, (g.sold / max) * W)
        const neck = Math.max(NECK_MIN, ((g.link ?? 0) / max) * W)
        const use = g.busy !== null && g.link ? g.busy / g.link : null
        const c = W / 2 + 6
        const mid = H / 2
        // Two bulbs joined at the neck (cubic curves), the bottom one as wide as the top so the sand reads as a level.
        const bulb = (dir: 1 | -1) => {
          const y0 = mid + dir * 4
          const y1 = mid + dir * (H / 2 - 8)
          return `M${c - neck / 2},${y0} C${c - neck / 2},${y0 + dir * 26} ${c - top / 2},${y1 - dir * 34} ${c - top / 2},${y1} L${c + top / 2},${y1} C${c + top / 2},${y1 - dir * 34} ${c + neck / 2},${y0 + dir * 26} ${c + neck / 2},${y0} Z`
        }
        const level = use === null ? 0 : Math.min(1, use)
        const sandTop = H - 8 - level * (H / 2 - 12)
        return (
          <li key={g.id} className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.015] p-3">
            <svg role="img" aria-label={`${g.name}: ${lines(g).map((l) => `${l.label} ${l.value}`).join(", ")}`} width={W + 12} height={H} viewBox={`0 0 ${W + 12} ${H}`} className="shrink-0 overflow-visible">
              <defs>
                <linearGradient id={`hg-top-${id}-${gi}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.25} />
                </linearGradient>
                <clipPath id={`hg-clip-${id}-${gi}`}>
                  <path d={bulb(1)} />
                </clipPath>
              </defs>
              <rect x={c - top / 2 - 6} y={2} width={top + 12} height={4} rx={2} fill={INK.axis} />
              <rect x={c - top / 2 - 6} y={H - 6} width={top + 12} height={4} rx={2} fill={INK.axis} />
              <path d={bulb(-1)} fill={`url(#hg-top-${id}-${gi})`} stroke="rgba(255,255,255,0.18)" />
              <path d={bulb(1)} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" />
              {use !== null && (
                <g clipPath={`url(#hg-clip-${id}-${gi})`}>
                  <rect x={0} y={sandTop} width={W + 12} height={H - sandTop} fill={sandColor(use)} opacity={0.85} className="t2-rise" />
                  <rect x={0} y={sandTop} width={W + 12} height={1.5} fill="#ffffff" opacity={0.35} />
                </g>
              )}
              {!reduced &&
                use !== null &&
                [0, 1, 2].map((k) => (
                  <circle key={k} cx={c} r={1.3} fill={sandColor(use)}>
                    <animate attributeName="cy" values={`${mid - 6};${sandTop - 2}`} dur={`${0.9 + k * 0.15}s`} begin={`${k * 0.3}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.2" dur={`${0.9 + k * 0.15}s`} begin={`${k * 0.3}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              {use !== null && use > 1 && (
                <text x={c} y={H - 14} textAnchor="middle" fontSize={10} fill="#ffffff">
                  {Math.round(use * 100)} %
                </text>
              )}
            </svg>
            <dl className="grid min-w-0 gap-1.5 text-xs">
              <dt className="truncate text-sm text-zinc-100">{g.name}</dt>
              {lines(g).map((l) => (
                <dd key={l.label} className="grid">
                  <span className="text-zinc-500">{l.label}</span>
                  <span className={`font-mono tabular-nums ${l.tone === "bad" ? "text-red-300" : l.tone === "warn" ? "text-amber-200" : "text-zinc-100"}`}>{l.value}</span>
                </dd>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
