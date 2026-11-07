"use client"

import { useEffect } from "react"

/**
 * Feeds the cursor position to the `.surface` under the pointer (--mx/--my),
 * which drives its spotlight and lit border (globals.css). One passive
 * listener for the whole page, rAF-throttled; fine pointers only.
 */
export function SurfaceLight() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    let raf = 0
    let last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      const e = last
      const el = e && (e.target instanceof Element ? e.target.closest<HTMLElement>(".surface, .surface-cell") : null)
      if (!e || !el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${e.clientX - r.left}px`)
      el.style.setProperty("--my", `${e.clientY - r.top}px`)
    }
    const onMove = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])
  return null
}
