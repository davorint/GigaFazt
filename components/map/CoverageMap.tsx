"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import * as maplibregl from "maplibre-gl"
import type { Map as MLMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { Hand, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { clients } from "@/lib/clients"
import { corridors } from "@/lib/geo/corridors"
import { MAP_BOUNDS, MAP_FIT, STATES } from "@/lib/geo/states"
import { track } from "@/lib/analytics"
import { onMapFocus, takePendingMapFocus, type MapFocusTarget } from "@/lib/map-focus"
import { MapHud, type MapTarget } from "./MapHud"
import { MapLegend } from "./MapLegend"
import { motionReduced, subscribeMotion } from "@/lib/motion"
import { stateName } from "@/lib/geo/state-names"

const CYAN = "#06b6d4"
const AMBER = "#f59e0b"
const FPS = 30
type Layer = "clients" | "coverage"

/**
 * Coverage map (SPEC §5, owner direction: Radar-style, state-level, clients
 * first). MapLibre with a tile-less dark style: background + our GeoJSON only
 * (no third-party tiles). Corridor pulses and client pings animate at ≤ 30 fps,
 * pause offscreen/in background tabs, and are static under reduced motion.
 * Mobile starts non-interactive behind "Toca para explorar" (no scroll trap);
 * desktop never hijacks the scroll wheel (zoom via buttons/keyboard).
 * Lazy-loaded by LazyCoverageMap; the text equivalent is ClientList.
 */
export default function CoverageMap() {
  const t = useTranslations("map")
  const ts = useTranslations("states")
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [hover, setHover] = useState<MapTarget | null>(null)
  const [pinned, setPinned] = useState<MapTarget | null>(null)
  const [layers, setLayers] = useState<Layer[]>(["clients", "coverage"])
  const [focusHud, setFocusHud] = useState(false)
  // Client-only component (ssr:false), so matchMedia is safe at init.
  const [locked, setLocked] = useState(() => window.matchMedia("(max-width: 767px)").matches)

  const hoverKey = useRef("")
  const setHoverIfChanged = useCallback((target: MapTarget | null) => {
    const key = target ? `${target.kind}:${target.id}` : ""
    if (key === hoverKey.current) return
    hoverKey.current = key
    setHover(target)
  }, [])

  const pin = useCallback((target: MapTarget | null) => {
    setPinned(target)
    if (target?.kind === "state") track("map_region_opened", { slug: target.id })
    if (target?.kind === "client") track("map_region_opened", { client: target.id })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const mobile = window.matchMedia("(max-width: 767px)").matches

    // Worker is copied to /public by scripts/copy-maplibre-worker.mjs.
    maplibregl.setWorkerUrl(`/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`)
    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#030712" } }],
      },
      bounds: MAP_FIT,
      fitBoundsOptions: { padding: 24 },
      maxBounds: MAP_BOUNDS,
      minZoom: 6,
      maxZoom: 11,
      dragRotate: false,
      pitchWithRotate: false,
      scrollZoom: false,
      attributionControl: false,
      locale: {
        "Map.Title": t("ui.map"),
        "NavigationControl.ZoomIn": t("ui.zoomIn"),
        "NavigationControl.ZoomOut": t("ui.zoomOut"),
        "CooperativeGesturesHandler.MobileHelpText": t("ui.twoFingers"),
        "CooperativeGesturesHandler.WindowsHelpText": t("ui.ctrlScroll"),
        "CooperativeGesturesHandler.MacHelpText": t("ui.cmdScroll"),
      },
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")

    if (mobile) {
      map.dragPan.disable()
      map.touchZoomRotate.disable()
      map.doubleClickZoom.disable()
    }

    const labelMarkers: maplibregl.Marker[] = []

    map.on("load", () => {
      map.addSource("states", { type: "geojson", data: "/geo/states.json", promoteId: "state" })
      map.addLayer({
        id: "states-fill",
        type: "fill",
        source: "states",
        paint: {
          "fill-color": CYAN,
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.2, 0.09],
        },
      })
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        paint: {
          "line-color": CYAN,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0.45],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.6, 0.8],
          "line-blur": ["case", ["boolean", ["feature-state", "hover"], false], 1.2, 0],
        },
      })

      map.addSource("corridors", {
        type: "geojson",
        lineMetrics: true,
        data: {
          type: "FeatureCollection",
          features: corridors.map((c) => ({
            type: "Feature",
            properties: { id: c.id },
            geometry: { type: "LineString", coordinates: c.coords },
          })),
        },
      })
      map.addLayer({
        id: "corridor-base",
        type: "line",
        source: "corridors",
        layout: { "line-cap": "round" },
        paint: { "line-color": CYAN, "line-opacity": 0.3, "line-width": 1.2, "line-dasharray": [2, 2] },
      })
      map.addLayer({
        id: "corridor-pulse",
        type: "line",
        source: "corridors",
        layout: { "line-cap": "round" },
        paint: { "line-width": 2.5, "line-gradient": pulseGradient(0.5) },
      })

      map.addSource("clients", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: clients.map((c) => ({
            type: "Feature",
            id: c.id,
            properties: { id: c.id, demo: c.demo },
            geometry: { type: "Point", coordinates: c.lngLat },
          })),
        },
        promoteId: "id",
      })
      map.addLayer({
        id: "clients-ping",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 10,
          "circle-color": "transparent",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": ["case", ["get", "demo"], AMBER, CYAN],
          "circle-stroke-opacity": 0.35,
        },
      })
      map.addLayer({
        id: "clients-dot",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 7, 5],
          "circle-color": ["case", ["get", "demo"], "transparent", CYAN],
          "circle-stroke-width": ["case", ["get", "demo"], 1.6, 0],
          "circle-stroke-color": AMBER,
          "circle-blur": 0.15,
        },
      })

      // Signal readiness once the outlines are in (tests/screenshots wait on this;
      // "idle" never fires while the pulse animates).
      const onData = (e: maplibregl.MapSourceDataEvent) => {
        if (e.sourceId === "states" && e.isSourceLoaded) {
          el.setAttribute("data-map-ready", "true")
          map.off("sourcedata", onData)
        }
      }
      map.on("sourcedata", onData)

      const early = takePendingMapFocus()
      if (early) focusTarget(early)

      // State labels as HTML (tile-less style has no glyphs).
      for (const s of STATES) {
        const node = document.createElement("div")
        node.className = "map-state-label pointer-events-none font-mono text-[10px] uppercase tracking-[0.2em] text-white/45"
        node.textContent = stateName(ts, s.slug)
        labelMarkers.push(new maplibregl.Marker({ element: node }).setLngLat(s.label).addTo(map))
      }

      // Hover / click.
      let hoverState: string | null = null
      let hoverClient: string | null = null
      const clearHover = () => {
        if (hoverState) map.setFeatureState({ source: "states", id: hoverState }, { hover: false })
        if (hoverClient) map.setFeatureState({ source: "clients", id: hoverClient }, { hover: false })
        hoverState = hoverClient = null
      }
      map.on("mousemove", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["clients-dot", "states-fill"].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none") })
        const client = hits.find((f) => f.layer.id === "clients-dot")
        const state = hits.find((f) => f.layer.id === "states-fill")
        clearHover()
        if (client) {
          hoverClient = String(client.properties.id)
          map.setFeatureState({ source: "clients", id: hoverClient }, { hover: true })
          setHoverIfChanged({ kind: "client", id: hoverClient })
        } else if (state) {
          hoverState = String(state.properties.state)
          map.setFeatureState({ source: "states", id: hoverState }, { hover: true })
          setHoverIfChanged({ kind: "state", id: hoverState })
        } else setHoverIfChanged(null)
        map.getCanvas().style.cursor = client || state ? "pointer" : ""
      })
      map.on("mouseout", () => {
        clearHover()
        setHoverIfChanged(null)
      })
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["clients-dot", "states-fill"] })
        const client = hits.find((f) => f.layer.id === "clients-dot")
        const state = hits.find((f) => f.layer.id === "states-fill")
        if (client) pin({ kind: "client", id: String(client.properties.id) })
        else if (state) pin({ kind: "state", id: String(state.properties.state) })
        else pin(null)
      })
    })

    // Animation: corridor pulse + client ping, ≤ 30 fps, only when visible.
    let raf = 0
    let last = 0
    let visible = true
    const loop = (now: number) => {
      if (!visible || document.visibilityState !== "visible" || motionReduced()) {
        raf = 0 // truly paused; resumed by the observer / visibilitychange
        return
      }
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      last = now
      if (!map.isStyleLoaded() || !map.getLayer("corridor-pulse")) return
      map.setPaintProperty("corridor-pulse", "line-gradient", pulseGradient((now / 3200) % 1))
      const p = (now / 2400) % 1
      map.setPaintProperty("clients-ping", "circle-radius", 6 + p * 16)
      map.setPaintProperty("clients-ping", "circle-stroke-opacity", 0.6 * (1 - p))
    }
    const resume = () => {
      if (!motionReduced() && !raf && visible && document.visibilityState === "visible") {
        raf = requestAnimationFrame(loop)
      }
    }
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting)
      resume()
    })
    io.observe(el)
    document.addEventListener("visibilitychange", resume)
    const unsubscribeMotion = subscribeMotion(resume)
    resume()

    // Text list → locate a client or a state on the map.
    function focusTarget(target: MapFocusTarget) {
      if (target.kind === "client") {
        const c = clients.find((x) => x.id === target.id)
        if (!c) return
        if (motionReduced()) map.jumpTo({ center: c.lngLat, zoom: 9.5 })
        else map.flyTo({ center: c.lngLat, zoom: 9.5, speed: 1.4 })
      } else {
        map.fitBounds(MAP_FIT, { padding: 24, animate: !motionReduced() })
      }
      pin(target)
      setFocusHud(true)
    }
    const offFocus = onMapFocus((target) => {
      if (map.loaded()) focusTarget(target)
      else map.once("load", () => focusTarget(target))
    })

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      offFocus()
      document.removeEventListener("visibilitychange", resume)
      unsubscribeMotion()
      labelMarkers.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
    }
  }, [pin, setHoverIfChanged, t, ts])

  // Layer visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const vis = (on: boolean) => (on ? "visible" : "none")
      for (const id of ["clients-dot", "clients-ping"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(layers.includes("clients")))
      }
      for (const id of ["states-fill", "states-line"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(layers.includes("coverage")))
      }
      containerRef.current
        ?.querySelectorAll<HTMLElement>(".map-state-label")
        .forEach((n) => (n.style.visibility = layers.includes("coverage") ? "" : "hidden"))
    }
    if (map.isStyleLoaded()) apply()
    else map.once("load", apply)
  }, [layers])

  const unlock = () => {
    const map = mapRef.current
    if (!map) return
    map.dragPan.enable()
    map.touchZoomRotate.enable()
    map.touchZoomRotate.disableRotation()
    map.doubleClickZoom.enable()
    // One finger keeps scrolling the page; two fingers move the map (no trap).
    map.cooperativeGestures.enable()
    setLocked(false)
  }

  const reset = () => {
    const map = mapRef.current
    if (!map) return
    map.fitBounds(MAP_FIT, { padding: 24, animate: !motionReduced() })
    pin(null)
  }

  const target = pinned ?? hover
  const realCount = clients.filter((c) => !c.demo).length
  const demoCount = clients.length - realCount

  return (
    <div className="hud-brackets relative h-[460px] overflow-hidden rounded-xl border border-border bg-background md:h-[580px]">
      <div
        ref={containerRef}
        data-map
        role="region"
        aria-label={t("mapAlt", { real: realCount, demo: demoCount })}
        // Not absolute: maplibre's CSS forces .maplibregl-map to position:relative.
        className="h-full w-full"
      />
      {/* Holographic grid over the map, fades at the edges (DESIGN). */}
      <div aria-hidden className="holo-grid pointer-events-none absolute inset-0 opacity-60" />

      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <ToggleGroup
          multiple
          value={layers}
          onValueChange={(v) => setLayers(v as Layer[])}
          aria-label={t("layers")}
          className="rounded-lg border border-border bg-background/70 p-1 font-mono text-xs backdrop-blur-md"
        >
          <ToggleGroupItem value="clients" size="sm" className="font-mono text-xs">
            {t("layer.clients")}
          </ToggleGroupItem>
          <ToggleGroupItem value="coverage" size="sm" className="font-mono text-xs">
            {t("layer.coverage")}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="border-border bg-background/70 font-mono text-xs backdrop-blur-md"
        >
          <RotateCcw />
          {t("reset")}
        </Button>
      </div>

      {target && (
        <MapHud
          target={target}
          pinned={pinned !== null}
          autoFocus={focusHud}
          onClose={() => {
            pin(null)
            setFocusHud(false)
          }}
          className="absolute inset-x-3 bottom-3 z-10 md:inset-x-auto md:top-3 md:bottom-auto md:left-3"
        />
      )}

      {/* Phones get the legend below the map (CoverageMapSection) instead. */}
      <MapLegend className={target ? "absolute bottom-3 left-3 hidden" : "absolute bottom-3 left-3 hidden md:block"} />

      {locked && (
        <button
          type="button"
          onClick={unlock}
          className="absolute inset-0 flex items-center justify-center bg-background/30"
        >
          <span className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 font-mono text-xs uppercase tracking-wider backdrop-blur-md">
            <Hand className="size-4 text-fiber" aria-hidden />
            {t("tapToExplore")}
          </span>
        </button>
      )}
    </div>
  )
}

/** Moving bright segment along every corridor (line-progress 0..1). */
function pulseGradient(p: number): maplibregl.ExpressionSpecification {
  const head = Math.min(0.999, Math.max(0.02, p))
  const tail = Math.max(0.001, head - 0.14)
  const stops: (number | string)[] = [0, "rgba(6,182,212,0)"]
  if (tail > 0.001) stops.push(tail, "rgba(6,182,212,0)")
  stops.push(head, "rgba(6,182,212,0.95)")
  stops.push(Math.min(1, head + 0.001), "rgba(6,182,212,0)")
  if (head + 0.001 < 1) stops.push(1, "rgba(6,182,212,0)")
  return ["interpolate", ["linear"], ["line-progress"], ...stops] as maplibregl.ExpressionSpecification
}

