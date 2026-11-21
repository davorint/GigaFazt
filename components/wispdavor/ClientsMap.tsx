"use client"

import { useEffect, useRef } from "react"
import * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { toneOf, type MapSite, type Tone } from "@/lib/wispdavor/mapa"

const COLOR: Record<Tone, string> = { ok: "#34d399", late: "#fbbf24", suspended: "#f87171", empty: "#a1a1aa" }
/** CDMX metro + Morelos, when no deployment has a point yet. */
const DEFAULT_BOUNDS: [[number, number], [number, number]] = [
  [-99.45, 18.7],
  [-98.9, 19.65],
]

/**
 * The deployments on a tile-less dark map (like the public coverage map: background + municipal limits, no third-party
 * tiles), one dot each, colored by its clients. The list next to it is the text equivalent. Loaded only here (ssr:false).
 */
export default function ClientsMap({ sites, label, line }: { sites: MapSite[]; label: string; line: (s: MapSite) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    maplibregl.setWorkerUrl(`/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`)
    const points = sites.filter((s) => s.lat !== null && s.lng !== null)
    const map = new maplibregl.Map({
      container: el,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#030712" } }] },
      bounds: DEFAULT_BOUNDS,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // The box can still be settling when the map starts (it loads after the page): follow its size.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)
    map.on("load", () => {
      map.addSource("municipios", { type: "geojson", data: "/geo/municipios.json" })
      map.addLayer({ id: "municipios-line", type: "line", source: "municipios", paint: { "line-color": "#22d3ee", "line-opacity": 0.3, "line-width": 0.7 } })
      for (const s of points) {
        const dot = document.createElement("span")
        dot.style.cssText = `display:block;width:${10 + Math.min(18, s.clients)}px;height:${10 + Math.min(18, s.clients)}px;border-radius:9999px;background:${COLOR[toneOf(s)]};border:2px solid #030712;box-shadow:0 0 0 1px ${COLOR[toneOf(s)]}`
        dot.setAttribute("aria-hidden", "true")
        new maplibregl.Marker({ element: dot })
          .setLngLat([s.lng as number, s.lat as number])
          .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setText(`${s.name} · ${line(s)}`))
          .addTo(map)
      }
      if (points.length) {
        const b = new maplibregl.LngLatBounds()
        for (const s of points) b.extend([s.lng as number, s.lat as number])
        map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 })
      }
    })
    return () => {
      ro.disconnect()
      map.remove()
    }
  }, [sites, line])
  return <div ref={ref} role="img" aria-label={label} className="h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 sm:h-[560px]" />
}
