"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import { useReducedMotion } from "@/lib/motion"
import { SceneBoundary, canUseWebGL } from "./SceneBoundary"
import type { ModemCallouts } from "./ModemScene"

const ModemScene = dynamic(() => import("./ModemScene"), { ssr: false })

/** The full studio (reflective floor, bloom, live shadows, callouts) on capable desktops only. */
function pickQuality(): "high" | "low" {
  if (typeof window === "undefined") return "low"
  const fine = window.matchMedia("(pointer: fine)").matches
  const wide = window.innerWidth >= 1024
  const cores = navigator.hardwareConcurrency ?? 8
  return fine && wide && cores >= 4 ? "high" : "low"
}

/** Feathers all four edges of the (opaque) studio into the page. */
const FLOOR_FADE =
  "linear-gradient(to right, transparent, #000 16%, #000 84%, transparent), linear-gradient(to bottom, transparent, #000 10%, #000 80%, transparent)"

/**
 * The plan's Wi-Fi 7 modem as a studio product shot (fiber/ModemScene, lazy)
 * in the Wi-Fi spotlight. Fixed-size box (no layout shift): an SVG drawing
 * underneath, the three.js render fades in on top once the box is near the
 * viewport and pauses offscreen. The render's edges fade into the page (CSS
 * mask); its spec callouts render into an unmasked overlay so they stay crisp.
 * Captioned "Ilustración" (no brand on the site).
 */
export function ModemShowcase({
  caption,
  callouts,
  className,
}: {
  caption: string
  callouts?: ModemCallouts
  className?: string
}) {
  const t = useTranslations("fiber.wifi.modemArt")
  const box = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [near, setNear] = useState(false)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [webgl] = useState(() => typeof window !== "undefined" && canUseWebGL())
  // Only read once the render is live (client), so SSR never depends on them.
  const [interactive] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches)
  const [quality] = useState(pickQuality)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        setActive(e.isIntersecting)
        if (e.isIntersecting) setNear(true)
      },
      { rootMargin: "200px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const live = near && webgl && !failed

  return (
    <figure className={cn("relative", className)}>
      <div ref={box} role="img" aria-label={t("alt")} className="relative h-full w-full">
        {/* Soft floor light behind the object (under the poster). */}
        <div aria-hidden className="absolute inset-x-[10%] bottom-[8%] h-1/3 rounded-full bg-cyan-400/10 blur-3xl" />
        <ModemPoster className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", live && ready ? "opacity-0" : "opacity-100")} />
        {live && (
          <div
            aria-hidden
            className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}
            style={{ maskImage: FLOOR_FADE, WebkitMaskImage: FLOOR_FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
          >
            <SceneBoundary onError={() => setFailed(true)}>
              <ModemScene
                still={reduced}
                interactive={interactive && !reduced}
                active={active}
                quality={quality}
                callouts={callouts}
                calloutLayer={overlay}
                track={box}
                onReady={() => setReady(true)}
              />
            </SceneBoundary>
          </div>
        )}
        <div ref={overlay} aria-hidden className="pointer-events-none absolute inset-0" />
      </div>
      <figcaption className="mt-1 text-center font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

/** Static drawing of the same object (first paint, no WebGL, render failed). */
function ModemPoster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" aria-hidden className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="mp-body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f4f7fa" />
          <stop offset="0.55" stopColor="#d9dee5" />
          <stop offset="1" stopColor="#aeb6c1" />
        </linearGradient>
        <radialGradient id="mp-shadow">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[118, 150, 182].map((rx, i) => (
        <ellipse key={rx} cx="150" cy="236" rx={rx} ry={rx * 0.17} fill="none" stroke="#67e8f9" strokeOpacity={0.16 - i * 0.045} />
      ))}
      <ellipse cx="150" cy="238" rx="118" ry="20" fill="url(#mp-shadow)" />
      {/* Glass plinth with its cyan edge light. */}
      <ellipse cx="150" cy="232" rx="106" ry="17" fill="#0a0d12" />
      <ellipse cx="150" cy="228" rx="106" ry="17" fill="#11151b" stroke="#67e8f9" strokeOpacity="0.5" strokeWidth="0.8" />
      {/* Blade antennas at the back corners. */}
      <rect x="76" y="62" width="9" height="146" rx="3" fill="url(#mp-body)" />
      <rect x="215" y="62" width="9" height="146" rx="3" fill="url(#mp-body)" />
      {/* Hinge ears on the body's sides, with the antenna knuckles on them. */}
      <rect x="77" y="203" width="16" height="9" rx="3" fill="#d4dae1" />
      <rect x="207" y="203" width="16" height="9" rx="3" fill="#d4dae1" />
      <circle cx="80.5" cy="207.5" r="5" fill="#e6eaef" />
      <circle cx="219.5" cy="207.5" r="5" fill="#e6eaef" />
      {/* Lid: top face in perspective, then its front edge. */}
      <path d="M104 176 H196 Q204 176 208 181 L216 192 H84 L92 181 Q96 176 104 176 Z" fill="#f4f7fa" />
      <rect x="84" y="192" width="132" height="8" rx="2" fill="url(#mp-body)" />
      {[0, 1, 6].map((i) => (
        <circle key={i} cx={122 + i * 8} cy="187" r="1.2" fill="#a5f3fc" />
      ))}
      {/* Inset lower body with vent slats. */}
      <rect x="89" y="200" width="122" height="24" rx="2" fill="#dde2e8" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="96" y={203 + i * 4.2} width="108" height="1.6" fill="#8d96a2" />
      ))}
    </svg>
  )
}
