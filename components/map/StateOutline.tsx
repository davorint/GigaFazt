import { useTranslations } from "next-intl"
import { cn } from "cn"
import geo from "@/public/geo/states.json"
import zoneGeo from "@/public/geo/service-zone.json"
import { clients } from "@/lib/clients"
import type { StateCode } from "@/lib/types"
import { stateIn } from "@/lib/geo/state-names"
import { STATES } from "@/lib/geo/states"

type Ring = number[][]
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] }
type Feature = { properties: { state: string; name: string }; geometry: Geometry }

const features = (geo as { features: Feature[] }).features
const zone = (zoneGeo as unknown as { features: { properties: { state: string }; geometry: Geometry }[] }).features
const W = 600
const PAD = 16

/**
 * Static SVG of the three states with one outlined and its service zone lit
 * (lib/coverage SERVICE_ZONE; for the /cobertura pages). Server-rendered from /public/geo/states.json: zero JS,
 * no MapLibre. Equirectangular with cos(lat) correction (fine at this scale).
 * Client dots are neighborhood-level; demo clients use the amber ring.
 */
export function StateOutline({ state, className }: { state: StateCode; className?: string }) {
  const t = useTranslations("area")
  const ts = useTranslations("states")
  const polys = (g: Geometry): Ring[][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
  const all = features.flatMap((f) => polys(f.geometry).flat().flat())
  const lngs = all.map((p) => p[0])
  const lats = all.map((p) => p[1])
  const [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)]
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180)
  const scale = (W - PAD * 2) / ((e - w) * k)
  const H = Math.round((n - s) * scale + PAD * 2)
  const xy = ([lng, lat]: number[]) => [PAD + (lng - w) * k * scale, PAD + (n - lat) * scale]
  const path = (g: Geometry) =>
    polys(g)
      .flatMap((poly) =>
        poly.map((ring) => "M" + ring.map((p) => xy(p).map((v) => v.toFixed(1)).join(",")).join("L") + "Z")
      )
      .join("")

  const here = clients.filter((c) => c.state === state)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("outlineAlt", { state: stateIn(ts, STATES.find((s) => s.code === state)?.slug ?? "") })}
      className={cn("h-auto w-full", className)}
    >
      {features.map((f) => {
        const active = f.properties.state === state
        return (
          <path
            key={f.properties.state}
            d={path(f.geometry)}
            className={active ? "fill-fiber/[0.06] stroke-fiber/70" : "fill-white/[0.03] stroke-white/15"}
            strokeWidth={active ? 1.2 : 1}
            strokeLinejoin="round"
          />
        )
      })}
      {zone
        .filter((z) => z.properties.state === state)
        .map((z) => (
          <path
            key={z.properties.state}
            d={path(z.geometry)}
            className="fill-fiber/30 stroke-fiber"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 6px var(--color-fiber))" }}
          />
        ))}
      {here.map((c) => {
        const [x, y] = xy(c.lngLat)
        return c.demo ? (
          <circle key={c.id} cx={x} cy={y} r={5} className="fill-none stroke-warn" strokeWidth={1.5} />
        ) : (
          <circle key={c.id} cx={x} cy={y} r={5} className="fill-fiber" style={{ filter: "drop-shadow(0 0 4px var(--color-fiber))" }} />
        )
      })}
    </svg>
  )
}
