"use client"

import { useEffect, useRef } from "react"

/**
 * Sets `data-inview` while the wrapper is on screen, so CSS loops inside it
 * (e.g. `.biz-flow`) only run when visible: they repaint every frame.
 * Also sets `data-seen` the first time it is visible (never removed), for
 * once-per-section reveals (DESIGN motion: animate on scroll once).
 */
export function InView({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "ol"
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        el.toggleAttribute("data-inview", e.isIntersecting)
        if (e.isIntersecting) el.setAttribute("data-seen", "")
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    // Polymorphic ref: both tags are HTMLElements.
    <Tag ref={ref as React.RefObject<never>} className={className}>
      {children}
    </Tag>
  )
}
