import { useTranslations } from "next-intl"

/**
 * Isometric cross-section of a four-level business: fiber enters from the
 * street (acometida), climbs a riser and branches to areas on every level.
 * A technical drawing, not an illustration: hairlines, one accent, mono
 * labels. Lines draw in once on load; light packets climb the riser and run
 * one branch per level while visible (`.iso-*` in globals.css; still under
 * reduced motion / paused animations). Server-rendered SVG, decorative
 * (aria-hidden): the page text carries the same message.
 */

const C = Math.cos(Math.PI / 6)
const S = 0.5
/** Isometric projection of plan (x, y) at height z. */
const P = (x: number, y: number, z: number) => [(x - y) * C, (x + y) * S - z] as const
const pt = (x: number, y: number, z: number) => P(x, y, z).map((n) => n.toFixed(1)).join(" ")

const W = 260 // plate width (plan x)
const D = 180 // plate depth (plan y)
const LEVELS = [0, 82, 164, 246]
const RX = W / 2
const RY = D / 2
const ENTRY_Z = -40
const STREET_Y = D + 150

/** Areas per level (plan coordinates); branches run x first, then y. */
const NODES: [number, number][][] = [
  [[34, 30], [226, 30], [34, 150], [226, 150]],
  [[30, 90], [230, 40], [230, 140], [130, 160]],
  [[40, 40], [220, 40], [40, 150], [220, 150], [130, 20]],
  [[50, 30], [210, 30], [130, 160]],
]

const plate = (z: number) =>
  `M${pt(0, 0, z)} L${pt(W, 0, z)} L${pt(W, D, z)} L${pt(0, D, z)} Z`
const branch = (z: number, [x, y]: [number, number]) =>
  `M${pt(RX, RY, z)} L${pt(x, RY, z)} L${pt(x, y, z)}`
const diamond = (x: number, y: number, z: number, r = 7) =>
  `M${pt(x - r, y, z)} L${pt(x, y - r, z)} L${pt(x + r, y, z)} L${pt(x, y + r, z)} Z`

export type IsoFocus = "entry" | "riser" | "floors" | "inside"
type Part = "entry" | "riser" | number

/** Which parts a story chapter lights ("hot") and which it dims. */
function focusClass(focus: IsoFocus | undefined, part: Part): string | undefined {
  if (!focus) return undefined
  const hot =
    (focus === "entry" && part === "entry") ||
    (focus === "riser" && part === "riser") ||
    (focus === "floors" && typeof part === "number") ||
    (focus === "inside" && part === LEVELS.length - 1)
  if (hot) return "iso-hot"
  const neutral = (focus === "riser" && part === "entry") || (focus === "floors" && part === "riser")
  return neutral ? undefined : "iso-dim"
}

/**
 * `uid` keeps the gradient id unique when the drawing appears twice on a page;
 * `labels={false}` for a backdrop; `focus` lights one part for a story
 * chapter (the phone / reduced-motion story) and dims the rest; hot parts
 * light up once the wrapper is first seen (`.iso-hot`, globals.css).
 */
export function IsoBuilding({ className, uid = "iso", labels = true, focus }: { className?: string; uid?: string; labels?: boolean; focus?: IsoFocus }) {
  const t = useTranslations("business.schematic")
  const fc = (part: Part) => focusClass(focus, part)
  const top = LEVELS[LEVELS.length - 1]
  const [rx0, ry0] = P(RX, RY, ENTRY_Z)
  const [, ryTop] = P(RX, RY, top)
  const riserLen = ry0 - ryTop

  return (
    <svg viewBox="-360 -300 720 600" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.10" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.015" />
        </linearGradient>
      </defs>

      {/* Vertical edges of the volume (dashed: the building's envelope). */}
      {[[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => (
        <path
          key={`e${x}${y}`}
          d={`M${pt(x, y, LEVELS[0])} L${pt(x, y, top)}`}
          stroke="#ffffff"
          strokeOpacity="0.12"
          strokeDasharray="2 5"
          fill="none"
        />
      ))}

      {/* Floor plates, bottom to top. */}
      {LEVELS.map((z, i) => (
        <g key={z} className={fc(i)}>
          <path d={plate(z)} fill={`url(#${uid}-plate)`} className="iso-fade" style={{ "--d": 150 + i * 120 } as React.CSSProperties} />
          <path
            d={plate(z)}
            pathLength={1}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={i === LEVELS.length - 1 ? 0.5 : 0.28}
            className="iso-draw"
            style={{ "--d": i * 120 } as React.CSSProperties}
          />
          {/* Level label at the left corner. */}
          {labels && <text
            x={P(0, D, z)[0] - 14}
            y={P(0, D, z)[1] + 4}
            textAnchor="end"
            className="iso-fade fill-zinc-400 font-mono text-[11px] tracking-[0.15em]"
            style={{ "--d": 500 + i * 120 } as React.CSSProperties}
          >
            {t("level", { n: i + 1 })}
          </text>}
        </g>
      ))}

      {/* Street → service entrance, then the riser. */}
      <g className={fc("entry")}>
        <path
          d={`M${pt(RX, STREET_Y, ENTRY_Z)} L${pt(RX, RY, ENTRY_Z)}`}
          pathLength={1}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
          className="iso-draw"
          style={{ "--d": 500 } as React.CSSProperties}
        />
        {/* The optional backup route, only in the "fiber arrives" chapter. */}
        {focus === "entry" && (
          <path d={`M${pt(-90, RY, ENTRY_Z)} L${pt(RX, RY, ENTRY_Z)}`} fill="none" stroke="#c4b5fd" strokeWidth="1.6" strokeDasharray="5 6" />
        )}
      </g>
      <g className={fc("riser")}>
        <path
          d={`M${pt(RX, RY, ENTRY_Z)} L${pt(RX, RY, top + 18)}`}
          pathLength={1}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
          className="iso-draw"
          style={{ "--d": 800 } as React.CSSProperties}
        />
      </g>

      {/* Branches and connected areas on every level. */}
      {LEVELS.map((z, i) => (
        <g key={`b${z}`} className={fc(i)}>
          {NODES[i].map((n, j) => (
            <path
              key={j}
              d={branch(z, n)}
              pathLength={1}
              fill="none"
              stroke="#c4b5fd"
              strokeOpacity="0.75"
              strokeWidth="1.2"
              className="iso-draw"
              style={{ "--d": 900 + i * 140 + j * 40 } as React.CSSProperties}
            />
          ))}
          {NODES[i].map(([x, y], j) => (
            <path
              key={`n${j}`}
              d={diamond(x, y, z)}
              fill="#0b0b0e"
              stroke="#ffffff"
              strokeOpacity="0.85"
              className="iso-fade"
              style={{ "--d": 1500 + i * 140 + j * 40 } as React.CSSProperties}
            />
          ))}
          {/* Riser junction on this level. */}
          <circle cx={P(RX, RY, z)[0]} cy={P(RX, RY, z)[1]} r="3.2" fill="#ffffff" className="iso-fade" style={{ "--d": 900 + i * 140 } as React.CSSProperties} />
        </g>
      ))}

      {/* Light packets: two climb the riser, one runs a branch per level. */}
      {[0, 1].map((k) => (
        <rect
          key={`r${k}`}
          x={rx0 - 1.5}
          y={ry0 - 16}
          width="3"
          height="16"
          rx="1.5"
          fill="#ffffff"
          className="iso-packet"
          style={{ "--dx": "0px", "--dy": `${-riserLen}px`, "--t": "2.6s", "--d": 1800 + k * 1300 } as React.CSSProperties}
        />
      ))}
      {LEVELS.map((z, i) => {
        const [x] = NODES[i][1]
        const [ax, ay] = P(RX, RY, z)
        const [bx, by] = P(x, RY, z)
        return (
          <circle
            key={`p${z}`}
            cx={ax}
            cy={ay}
            r="2.6"
            fill="#ffffff"
            className="iso-packet"
            style={{ "--dx": `${bx - ax}px`, "--dy": `${by - ay}px`, "--t": "1.8s", "--d": 2200 + i * 450 } as React.CSSProperties}
          />
        )
      })}

      {/* Callouts (off when the drawing is a backdrop). */}
      {labels && <g className="iso-fade font-mono text-[11px] tracking-[0.15em] uppercase" style={{ "--d": 1600 } as React.CSSProperties}>
        <path d={`M${pt(RX, STREET_Y - 40, ENTRY_Z)} l -40 26 h -70`} fill="none" stroke="#ffffff" strokeOpacity="0.35" />
        <text x={P(RX, STREET_Y - 40, ENTRY_Z)[0] - 114} y={P(RX, STREET_Y - 40, ENTRY_Z)[1] + 22} textAnchor="end" className="fill-zinc-300">
          {t("entry")}
        </text>
        <path d={`M${pt(RX, RY, top + 18)} l -34 -24 h -60`} fill="none" stroke="#ffffff" strokeOpacity="0.35" />
        <text x={P(RX, RY, top + 18)[0] - 100} y={P(RX, RY, top + 18)[1] - 20} textAnchor="end" className="fill-violet-300">
          {t("riser")}
        </text>
        <path d={`M${pt(W - 30, 30, LEVELS[2])} l 26 -14 h 16`} fill="none" stroke="#ffffff" strokeOpacity="0.35" />
        <text x={P(W - 30, 30, LEVELS[2])[0] + 46} y={P(W - 30, 30, LEVELS[2])[1] - 10} className="fill-zinc-300">
          {t("node")}
        </text>
      </g>}
    </svg>
  )
}
