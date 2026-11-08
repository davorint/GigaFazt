"use client"

import { useEffect, useRef } from "react"

/**
 * A display heading whose words rise out of a mask, once, the first time it
 * scrolls into view (globals.css `.mask-word`). Only "arms" (hides the words)
 * when JS runs and the heading starts off screen, so without JS, on reloads
 * mid-page, under reduced motion and in screenshots the text is simply there.
 */
export function RevealHeading({
  as: Tag = "h2",
  className,
  children,
}: {
  as?: "h1" | "h2"
  className?: string
  children: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) return // already visible: no reveal
    el.setAttribute("data-armed", "")
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        el.setAttribute("data-seen", "")
        io.disconnect()
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const words = children.split(/\s+/).filter(Boolean)
  return (
    <Tag ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="mask-word">
            <span style={{ "--i": i } as React.CSSProperties}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  )
}
