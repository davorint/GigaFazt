"use client"

import { useLayoutEffect, useRef } from "react"
import { motionReduced } from "@/lib/motion"

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Mono number that tweens to its new value in ~220 ms (DESIGN motion: 150–250
 * ms). Writes the text node directly (no re-render per frame). Instant under
 * prefers-reduced-motion. Visual only: callers expose the final value to
 * assistive tech separately so intermediate frames aren't read.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const fromRef = useRef(value)

  // Layout effect: reset to the old value before paint so React's committed
  // final text never flashes ahead of the tween.
  useLayoutEffect(() => {
    // Mutate React's own text node (not textContent, which would replace it
    // and detach it from React's future updates).
    const node = ref.current?.firstChild
    const from = fromRef.current
    fromRef.current = value
    if (!node || from === value) return
    const el = { set textContent(v: string) { node.nodeValue = v } }
    if (motionReduced()) {
      el.textContent = format(value)
      return
    }
    el.textContent = format(from)
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 220)
      el.textContent = format(Math.round(from + (value - from) * EASE(p)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.textContent = format(value)
    }
  }, [value, format])

  return (
    <span ref={ref} aria-hidden className={className}>
      {format(value)}
    </span>
  )
}
