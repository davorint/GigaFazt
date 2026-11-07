"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Renders `fallback` until the wrapper is within `rootMargin` of the viewport,
 * then renders `children` (typically a next/dynamic component, so its chunk is
 * only fetched then). Keeps below-the-fold widgets out of the first load.
 * The wrapper keeps `minHeight` so the swap doesn't shift layout.
 */
export function WhenVisible({
  children,
  fallback,
  rootMargin = "600px",
  minHeight,
  className,
}: {
  children: ReactNode
  fallback: ReactNode
  rootMargin?: string
  minHeight?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className} style={minHeight ? { minHeight } : undefined}>
      {visible ? children : fallback}
    </div>
  )
}
