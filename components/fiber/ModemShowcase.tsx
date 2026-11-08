"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import { useReducedMotion } from "@/lib/motion"
import { SceneBoundary, canUseWebGL } from "./SceneBoundary"

const ModemScene = dynamic(() => import("./ModemScene"), { ssr: false })

/**
 * The plan's Wi-Fi 7 modem as a small product render beside the Wi-Fi section
 * heading. Fixed-size box (no layout shift): an SVG drawing underneath, the
 * three.js render (fiber/ModemScene, lazy) fades in on top once the box is
 * near the viewport; it pauses offscreen. Captioned "Ilustración": a generic
 * unbranded modem, not the exact product (no brand on the site).
 */
export function ModemShowcase({ caption, className }: { caption: string; className?: string }) {
  const t = useTranslations("fiber.wifi.modemArt")
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [near, setNear] = useState(false)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [webgl] = useState(() => typeof window !== "undefined" && canUseWebGL())
  // Only read once the render is live (client), so SSR never depends on it.
  const [interactive] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches)

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
        {/* Soft floor light behind the object. */}
        <div aria-hidden className="absolute inset-x-[10%] bottom-[8%] h-1/3 rounded-full bg-cyan-400/10 blur-3xl" />
        <ModemPoster className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", live && ready ? "opacity-0" : "opacity-100")} />
        {live && (
          <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
            <SceneBoundary onError={() => setFailed(true)}>
              <ModemScene still={reduced} interactive={interactive && !reduced} active={active} onReady={() => setReady(true)} />
            </SceneBoundary>
          </div>
        )}
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
      {[70, 105, 140].map((rx, i) => (
        <ellipse key={rx} cx="150" cy="252" rx={rx} ry={rx * 0.18} fill="none" stroke="#67e8f9" strokeOpacity={0.35 - i * 0.1} />
      ))}
      <ellipse cx="150" cy="252" rx="78" ry="12" fill="url(#mp-shadow)" />
      <rect x="112" y="238" width="76" height="11" rx="4" fill="#14171c" />
      <rect x="104" y="62" width="92" height="178" rx="13" fill="url(#mp-body)" />
      <rect x="138" y="211" width="24" height="1.6" rx="0.8" fill="#a5f3fc" />
    </svg>
  )
}
