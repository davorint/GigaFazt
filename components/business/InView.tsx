"use client"

import { useEffect, useRef } from "react"

/**
 * Sets `data-inview` while the wrapper is on screen, so CSS loops inside it
 * (e.g. `.biz-flow`) only run when visible: they repaint every frame.
 */
export function InView({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-inview", e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
