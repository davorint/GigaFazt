"use client"

import type { SkySite } from "@/lib/interno/tablero2-more"
import { INK } from "@/components/dashboard/theme"

const WIN = 9
const GAP = 3
const LIT = "#fcd34d"

/**
 * Lit buildings: each deployment's towers with a window per apartment, one lit per active client (not their actual
 * apartment), so the share of lit windows is the penetration. Most-lit deployments first. HTML wraps the buildings, so
 * any width works; each building is an image with its numbers in words.
 */
export function Skyline({ sites, towerLabel, siteLine, looseLabel }: { sites: SkySite[]; towerLabel: (t: { name: string; lit: number; apartments: number }) => string; siteLine: (s: SkySite) => string; looseLabel: (n: number) => string }) {
  return (
    <ul className="flex flex-wrap items-end gap-x-6 gap-y-5">
      {sites.map((s, si) => {
        return (
          <li key={s.id} className="grid justify-items-start gap-2">
            <div className="flex items-end gap-2">
              {s.towers.map((t, ti) => {
                const w = t.cols * (WIN + GAP) + GAP + 6
                const h = t.floors * (WIN + GAP) + GAP + 6
                const lit = new Set(t.windows)
                return (
                  <svg key={t.id} role="img" aria-label={towerLabel(t)} width={w} height={h + 10} viewBox={`0 0 ${w} ${h + 10}`} className="block overflow-visible">
                    <title>{towerLabel(t)}</title>
                    {/* Roof: a parapet and an antenna on the taller towers. */}
                    {t.floors >= 8 && <line x1={w - 8} x2={w - 8} y1={0} y2={9} stroke={INK.axis} strokeWidth={1.5} />}
                    {t.floors >= 8 && <circle cx={w - 8} cy={1} r={1.5} fill="#d03b3b" className="t2-blink" />}
                    <rect x={0} y={9} width={w} height={h} rx={3} fill="#151517" stroke="rgba(255,255,255,0.09)" />
                    {Array.from({ length: t.apartments }, (_, i) => {
                      const floor = Math.floor(i / t.cols)
                      const col = i % t.cols
                      const on = lit.has(i)
                      return <rect key={i} x={3 + GAP + col * (WIN + GAP)} y={9 + h - 3 - (floor + 1) * (WIN + GAP)} width={WIN} height={WIN} rx={1} fill={on ? LIT : "rgba(255,255,255,0.05)"} style={on ? { filter: "drop-shadow(0 0 3px rgba(252,211,77,0.7))", animationDelay: `${si * 160 + ti * 80 + (i % 17) * 25}ms` } : undefined} className={on ? "t2-fade" : undefined} />
                    })}
                  </svg>
                )
              })}
            </div>
            <div className="h-px w-full bg-gradient-to-r from-amber-200/30 via-white/10 to-transparent" />
            <p className="max-w-56 text-xs leading-snug">
              <span className="block truncate text-zinc-100">{s.name}</span>
              <span className="text-zinc-400">{siteLine(s)}</span>
              {s.unassigned > 0 && <span className="block text-zinc-500">{looseLabel(s.unassigned)}</span>}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
