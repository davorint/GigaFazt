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

/** Tilted "holo table" camera. Pitch/bearing are fixed (no rotate gestures). */
function camera(mobile: boolean) {
  return {
    pitch: mobile ? 42 : 50,
    bearing: mobile ? -6 : -12,
    padding: mobile ? { top: 40, bottom: 24, left: 8, right: 8 } : { top: 70, bottom: 20, left: 60, right: 60 },
  }
}

/**
 * Fit the three states to the frame. fitBounds sizes for the unpitched
 * footprint, so the tilted view would leave the states small: nudge the zoom.
 */
function fitView(map: MLMap, mobile: boolean, animate: boolean, duration = 700) {
  const cam = camera(mobile)
  // Offset lifts the states toward the frame's middle (the tilted far side is
  // fog) and, on desktop, clears the bottom-left legend.
  const fit = map.cameraForBounds(MAP_FIT, { ...cam, offset: mobile ? [0, -70] : [70, -60] })
  if (!fit) return
  const opts = { ...fit, pitch: cam.pitch, bearing: cam.bearing, zoom: (fit.zoom ?? 8) + (mobile ? 0.1 : 0.4) }
  if (animate) map.easeTo({ ...opts, duration, easing: (t) => 1 - Math.pow(1 - t, 3) })
  else map.jumpTo(opts)
}

/** Faint ground grid over the camera bounds; tilts with the map (0.1°, 0.5° majors). */
function graticule(): GeoJSON.FeatureCollection {
  const [[w, s], [e, n]] = MAP_BOUNDS
  const features: GeoJSON.Feature[] = []
  const step = (from: number, to: number) => {
    const out: number[] = []
    for (let i = Math.ceil(from * 10); i <= Math.floor(to * 10); i++) out.push(i)
    return out
  }
  for (const i of step(w, e)) {
    features.push({ type: "Feature", properties: { major: i % 5 === 0 }, geometry: { type: "LineString", coordinates: [[i / 10, s], [i / 10, n]] } })
  }
  for (const i of step(s, n)) {
    features.push({ type: "Feature", properties: { major: i % 5 === 0 }, geometry: { type: "LineString", coordinates: [[w, i / 10], [e, i / 10]] } })
  }
  return { type: "FeatureCollection", features }
}

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
  const beams = useRef(new Map<string, HTMLElement>())
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
        // Fog toward the horizon so the tilted far edge dissolves into the page.
        sky: {
          "sky-color": "#030712",
          "horizon-color": "#0b2633",
          "fog-color": "#030712",
          "sky-horizon-blend": 0.5,
          "horizon-fog-blend": 0.6,
          "fog-ground-blend": 0.35,
        },
      },
      bounds: MAP_FIT,
      fitBoundsOptions: camera(mobile),
      maxBounds: MAP_BOUNDS,
      minZoom: 6,
      maxZoom: 11,
      maxPitch: 60,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
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
    const beamMarkers: maplibregl.Marker[] = []
    const beamNodes = beams.current

    // Fly-in (first time the map is well in view): start high and flat, then
    // ease down onto the tilted table. Skipped under reduced motion, for
    // static captures, and when a ClientList focus is already waiting.
    const flyIn = !motionReduced() && !document.documentElement.hasAttribute("data-shot")
    let flown = !flyIn
    const arrive = new IntersectionObserver(
      ([e]) => {
        // Observed only after "load" (map.loaded() can stay false while the
        // GeoJSON streams in, which would skip the one callback we get).
        if (!e.isIntersecting || e.intersectionRatio < 0.4 || flown) return
        flown = true
        arrive.disconnect()
        fitView(map, mobile, true, 2600)
      },
      { threshold: 0.45 }
    )

    map.on("load", () => {
      fitView(map, mobile, false)
      if (!flown) {
        map.jumpTo({ zoom: map.getZoom() - 1.4, pitch: 12, bearing: map.getBearing() + 14 })
        arrive.observe(el)
      }
      // Ground grid (replaces the flat CSS grid: this one tilts with the camera).
      map.addSource("grid", { type: "geojson", data: graticule() })
      map.addLayer({
        id: "grid",
        type: "line",
        source: "grid",
        paint: {
          "line-color": CYAN,
          "line-opacity": ["case", ["get", "major"], 0.1, 0.045],
          "line-width": ["case", ["get", "major"], 0.8, 0.5],
        },
      })

      // States as raised slabs: offset copies under an opaque top fake the walls
      // (viewport-anchored, so "down" on screen is always the wall side, and
      // every line stays registered to the top surface).
      map.addSource("states", { type: "geojson", data: "/geo/states.json", promoteId: "state" })
      map.addLayer({
        id: "states-wall-glow",
        type: "line",
        source: "states",
        paint: { "line-color": CYAN, "line-opacity": 0.22, "line-width": 10, "line-blur": 10, "line-translate": [0, 12], "line-translate-anchor": "viewport" },
      })
      map.addLayer({
        id: "states-wall",
        type: "fill",
        source: "states",
        paint: { "fill-color": "#041821", "fill-translate": [0, 10], "fill-translate-anchor": "viewport" },
      })
      map.addLayer({
        id: "states-wall-edge",
        type: "line",
        source: "states",
        paint: { "line-color": CYAN, "line-opacity": 0.35, "line-width": 1, "line-translate": [0, 10], "line-translate-anchor": "viewport" },
      })
      map.addLayer({
        id: "states-fill",
        type: "fill",
        source: "states",
        paint: {
          "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], "#082230", "#041219"],
        },
      })
      // Service zone (lib/coverage SERVICE_ZONE): CDMX, the Edomex municipios
      // bordering it, Cuernavaca + Tepoztlán. Lit on top of the dark state slabs.
      map.addSource("zone", { type: "geojson", data: "/geo/service-zone.json" })
      map.addLayer({
        id: "zone-fill",
        type: "fill",
        source: "zone",
        paint: { "fill-color": CYAN, "fill-opacity": 0.28 },
      })
      // Alcaldía / municipio limits: thin, faint, under the state outlines.
      map.addSource("municipios", { type: "geojson", data: "/geo/municipios.json" })
      map.addLayer({
        id: "municipios-line",
        type: "line",
        source: "municipios",
        layout: { "line-join": "round" },
        paint: {
          "line-color": CYAN,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.16, 10, 0.32],
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 11, 0.9],
        },
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
      // Soft light pooling around client sites (only where clients are).
      map.addLayer({
        id: "clients-glow",
        type: "heatmap",
        source: "clients",
        paint: {
          "heatmap-weight": ["case", ["get", "demo"], 0.5, 1],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 40, 8, 80, 11, 160],
          "heatmap-intensity": 0.7,
          "heatmap-opacity": 0.55,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(6,182,212,0)",
            0.3, "rgba(6,182,212,0.18)",
            0.7, "rgba(34,211,238,0.38)",
            1, "rgba(165,243,252,0.55)",
          ],
        },
      })

      map.addLayer({
        id: "states-glow",
        type: "line",
        source: "states",
        paint: {
          "line-color": CYAN,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.55, 0.25],
          "line-width": 6,
          "line-blur": 6,
        },
      })
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#a5f3fc", CYAN],
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.75],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 1.2],
        },
      })

      map.addLayer({
        id: "zone-glow",
        type: "line",
        source: "zone",
        layout: { "line-join": "round" },
        paint: { "line-color": CYAN, "line-opacity": 0.45, "line-width": 5, "line-blur": 5 },
      })
      map.addLayer({
        id: "zone-line",
        type: "line",
        source: "zone",
        layout: { "line-join": "round" },
        paint: { "line-color": "#67e8f9", "line-opacity": 0.85, "line-width": 1.2 },
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
        paint: { "line-color": CYAN, "line-opacity": 0.35, "line-width": 1.2, "line-dasharray": [2, 2] },
      })
      map.addLayer({
        id: "corridor-pulse",
        type: "line",
        source: "corridors",
        layout: { "line-cap": "round" },
        paint: { "line-width": 3, "line-blur": 1, "line-gradient": pulseGradient(0.5) },
      })

      // Ground ripples lie flat in perspective under each light column.
      map.addLayer({
        id: "clients-ping",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 10,
          "circle-color": "transparent",
          "circle-stroke-width": 1.4,
          "circle-stroke-color": ["case", ["get", "demo"], AMBER, CYAN],
          "circle-stroke-opacity": 0.4,
          "circle-pitch-alignment": "map",
          "circle-pitch-scale": "map",
        },
      })
      map.addLayer({
        id: "clients-dot",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 7, 5],
          "circle-color": ["case", ["get", "demo"], "rgba(245,158,11,0.15)", CYAN],
          "circle-stroke-width": ["case", ["get", "demo"], 1.6, 0],
          "circle-stroke-color": AMBER,
          "circle-blur": 0.15,
          "circle-pitch-alignment": "map",
        },
      })

      // Light columns: HTML markers (a vertical beam stays vertical on a tilted
      // map). Visual only; ClientList is the keyboard/screen-reader equivalent.
      for (const c of clients) {
        const node = document.createElement("div")
        node.className = "map-beam"
        node.setAttribute("aria-hidden", "true")
        if (c.demo) node.dataset.demo = ""
        const spark = document.createElement("span")
        spark.className = "map-beam-spark"
        node.appendChild(spark)
        node.addEventListener("mouseenter", () => setHoverIfChanged({ kind: "client", id: c.id }))
        node.addEventListener("mouseleave", () => setHoverIfChanged(null))
        node.addEventListener("click", (ev) => {
          ev.stopPropagation()
          pin({ kind: "client", id: c.id })
        })
        beamNodes.set(c.id, node)
        beamMarkers.push(
          new maplibregl.Marker({ element: node, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" })
            .setLngLat(c.lngLat)
            .addTo(map)
        )
      }

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
      if (early) {
        flown = true
        arrive.disconnect()
        focusTarget(early)
      }

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
        // Beam markers handle their own hover; their events bubble up to here.
        if ((e.originalEvent.target as Element | null)?.closest(".map-beam")) return
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
      el.classList.toggle("map-paused", !visible) // CSS beam sparks pause too
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
        fitView(map, mobile, !motionReduced())
      }
      pin(target)
      setFocusHud(true)
    }
    const offFocus = onMapFocus((target) => {
      flown = true
      arrive.disconnect()
      if (map.loaded()) focusTarget(target)
      else map.once("load", () => focusTarget(target))
    })

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      arrive.disconnect()
      offFocus()
      document.removeEventListener("visibilitychange", resume)
      unsubscribeMotion()
      labelMarkers.forEach((m) => m.remove())
      beamMarkers.forEach((m) => m.remove())
      beamNodes.clear()
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
      for (const id of ["clients-dot", "clients-ping", "clients-glow"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(layers.includes("clients")))
      }
      beams.current.forEach((n) => (n.style.visibility = layers.includes("clients") ? "" : "hidden"))
      for (const id of ["states-wall-glow", "states-wall", "states-wall-edge", "states-fill", "zone-fill", "municipios-line", "states-glow", "states-line", "zone-glow", "zone-line"]) {
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
    fitView(map, window.matchMedia("(max-width: 767px)").matches, !motionReduced())
    pin(null)
  }

  const target = pinned ?? hover

  // Light the column of the hovered / pinned client.
  useEffect(() => {
    const active = target?.kind === "client" ? target.id : null
    beams.current.forEach((n, id) => {
      if (id === active) n.dataset.active = ""
      else delete n.dataset.active
    })
  }, [target])
  const realCount = clients.filter((c) => !c.demo).length
  const demoCount = clients.length - realCount

  return (
    <div className="relative h-[540px] overflow-hidden md:h-[clamp(680px,88svh,900px)]">
      <div
        ref={containerRef}
        data-map
        role="region"
        aria-label={t("mapAlt", { real: realCount, demo: demoCount })}
        // Not absolute: maplibre's CSS forces .maplibregl-map to position:relative.
        className="h-full w-full"
      />
      {/* Soft vignette: the tilted table fades into the page at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_90%_at_50%_55%,transparent_55%,var(--color-background)_100%)]"
      />
      {/* Full-bleed: melt the top and bottom edges into the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

      {/* Overlay controls sit in the page's content column, not at the screen edges. */}
      <div className="pointer-events-none absolute inset-0">
      <div className="relative mx-auto h-full max-w-7xl [&>*]:pointer-events-auto">

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
      </div>
      </div>

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

