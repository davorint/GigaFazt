"use client"

import { useEffect, useRef } from "react"
import { motionReduced } from "@/lib/motion"

const EASE = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
const DURATION = 1400

/**
 * Display figure that counts up from 0 the first time it scrolls into view
 * ("+600", "24", "500"). The server HTML carries the final text (SEO, no-JS,
 * screen readers read the sr-only copy); the animated copy is aria-hidden.
 * Skipped for values under 10, under reduced motion / paused animations, and
 * when the figure is already on screen at mount (no flash of 0 above the fold).
 * While counting, the box keeps the final width, so shorter intermediate
 * values never shift what follows (CLS).
 */
export function CountUp({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    const node = el?.firstChild
    const m = text.match(/\d[\d,.\s]*\d|\d/)
    if (!el || !node || !m || motionReduced()) return
    // Static captures (scripts/screenshot.mjs) show the final figure.
    if (document.documentElement.hasAttribute("data-shot")) return
    const digits = m[0].replace(/\D/g, "")
    const target = Number(digits)
    if (!Number.isFinite(target) || target < 10) return
    // Keep the original grouping (e.g. "1,000" / "1 000") by re-inserting the
    // separator used in the final text.
    const sep = m[0].match(/\D/)?.[0] ?? ""
    const fmt = (n: number) => {
      const s = String(n)
      const grouped = sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : s
      return text.replace(m[0], grouped)
    }
    const set = (v: string) => {
      node.nodeValue = v
    }

    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) return

    // Hold the final width while counting so shorter values don't shift
    // what follows (CLS); released when done.
    el.style.display = "inline-block"
    el.style.minWidth = `${el.getBoundingClientRect().width}px`
    set(fmt(0))
    let raf = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / DURATION)
          set(fmt(Math.round(target * EASE(p))))
          if (p < 1) raf = requestAnimationFrame(tick)
          else el.style.minWidth = ""
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.6 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      set(text)
    }
  }, [text])

  return (
    <>
      <span ref={ref} aria-hidden className={className}>
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </>
  )
}
