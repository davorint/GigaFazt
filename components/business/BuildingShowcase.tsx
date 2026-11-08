"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { cn } from "cn"
import { useReducedMotion } from "@/lib/motion"
import { SceneBoundary, canUseWebGL } from "@/components/fiber/SceneBoundary"
import { storyEnabled } from "@/lib/biz-story"

const BuildingScene = dynamic(() => import("./BuildingScene"), { ssr: false })

function pickQuality(): "high" | "low" {
  if (typeof window === "undefined") return "low"
  const fine = window.matchMedia("(pointer: fine)").matches
  const wide = window.innerWidth >= 1024
  const cores = navigator.hardwareConcurrency ?? 8
  return fine && wide && cores >= 4 ? "high" : "low"
}

/** Feathers the (opaque) render into the page on all four edges. */
const FEATHER =
  "linear-gradient(to right, transparent, #000 14%, #000 86%, transparent), linear-gradient(to bottom, transparent, #000 12%, #000 82%, transparent)"

/**
 * The /empresas hero object: the server-rendered schematic (`poster`,
 * IsoBuilding) paints first and stays as the fallback (no WebGL, render
 * failed); the three.js building (BuildingScene, lazy, never in the initial
 * chunk) fades in on top once near the viewport and holds its frame offscreen.
 * Fixed-size box, so no layout shift. `alt` is the text equivalent.
 */
export function BuildingShowcase({
  alt,
  caption,
  poster,
  className,
}: {
  alt: string
  caption: string
  poster: React.ReactNode
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [near, setNear] = useState(false)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [webgl] = useState(() => typeof window !== "undefined" && canUseWebGL())
  const [interactive] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches)
  const [quality] = useState(pickQuality)
  // Scroll story (lib/biz-story): the scene follows the hero's story wrapper while it is on.
  const storyEl = useRef<HTMLElement | null>(null)
  const [story, setStory] = useState(false)

  useEffect(() => {
    storyEl.current = box.current?.closest<HTMLElement>("[data-biz-story]") ?? null
    const update = () => setStory(storyEnabled())
    update()
    window.addEventListener("resize", update)
    window.addEventListener("motionchange", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("motionchange", update)
    }
  }, [])

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
      <div ref={box} role="img" aria-label={alt} className="relative h-full w-full">
        <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-700", live && ready ? "opacity-0" : "opacity-100")}>
          {poster}
        </div>
        {live && (
          <div
            aria-hidden
            className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}
            style={{ maskImage: FEATHER, WebkitMaskImage: FEATHER, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
          >
            <SceneBoundary onError={() => setFailed(true)}>
              <BuildingScene
                still={reduced}
                interactive={interactive && !reduced}
                active={active}
                quality={quality}
                storyEl={story ? storyEl : undefined}
                onReady={() => setReady(true)}
              />
            </SceneBoundary>
          </div>
        )}
      </div>
      <figcaption className="absolute right-0 bottom-0 text-[0.7rem] text-zinc-400">{caption}</figcaption>
    </figure>
  )
}
