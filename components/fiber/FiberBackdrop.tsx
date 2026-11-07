"use client"

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import { FiberPoster } from "./FiberPoster"

// three.js only loads through this dynamic import, never in the initial bundle.
const FiberScene = dynamic(
  () => import("./FiberScene").then((m) => m.FiberScene),
  { ssr: false }
)

function canUseWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    )
  } catch {
    return false
  }
}

/** If the WebGL scene throws, swallow it and keep the poster (hard rule #9: the
 *  poster is the text-equivalent static frame anyway). */
class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Poster → WebGL crossfade layer behind the hero copy. Mounts the scene only
 * after `requestIdleCallback`, only when on screen and only with motion on;
 * unmounts it when scrolled far away so at most one live WebGL context exists
 * (SPEC "Performance techniques"). The poster stays as the static frame under
 * reduced motion or when WebGL is unavailable.
 */
export function FiberBackdrop() {
  const t = useTranslations("hero")
  const host = useRef<HTMLDivElement>(null)
  // Assume reduced until the media query resolves, so SSR/first paint is poster-only.
  const [reduced, setReduced] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [mount, setMount] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)")
    const mb = window.matchMedia("(max-width: 767px)")
    const sync = () => {
      setReduced(rm.matches)
      setMobile(mb.matches)
    }
    sync()
    rm.addEventListener("change", sync)
    mb.addEventListener("change", sync)
    return () => {
      rm.removeEventListener("change", sync)
      mb.removeEventListener("change", sync)
    }
  }, [])

  useEffect(() => {
    const el = host.current
    if (reduced || failed || !el || !canUseWebGL()) return

    const req = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    let idleId: number | undefined

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          idleId = req(() => setMount(true)) as unknown as number
        } else {
          if (idleId !== undefined) cancel(idleId)
          setMount(false)
          setReady(false)
        }
      },
      { rootMargin: "100px" }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (idleId !== undefined) cancel(idleId)
    }
  }, [reduced, failed])

  return (
    <div ref={host} className="absolute inset-0 -z-0 overflow-hidden">
      {/* Poster: the LCP element and the accessible text equivalent. */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700",
          ready ? "opacity-0" : "opacity-100"
        )}
      >
        <FiberPoster className="h-full w-full" label={t("canvasAlt")} />
      </div>

      {/* WebGL scene crossfades in once ready; decorative (poster carries the label). */}
      {mount && !failed && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            ready ? "opacity-100" : "opacity-0"
          )}
        >
          <SceneBoundary
            onError={() => {
              setFailed(true)
              setMount(false)
            }}
          >
            <FiberScene
              interactive={!mobile}
              quality={mobile ? "mobile" : "desktop"}
              onReady={() => setReady(true)}
            />
          </SceneBoundary>
        </div>
      )}

      {/* Fade the scene into the page so copy stays readable over it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent"
      />
    </div>
  )
}
